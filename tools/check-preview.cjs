/**
 * Checks each theme's cover image against the face it claims to preview.
 *
 * preview_tN.png is what the watchface list and the theme carousel show, and
 * it is drawn by a different code path from the widgets. That path once kept
 * its own copy of the layout arithmetic, missed the switch to right-aligned
 * column readings, and shipped a cover with every value hanging outside its
 * card — a bug invisible from any render of the face itself.
 *
 * Comparing whole images does not catch it: misplaced readings are a couple of
 * percent of the screen, which is the same order as the noise between the two
 * rendering pipelines. So the comparison is per reading, inside the box the
 * runtime gives that widget, where a shifted value changes almost everything.
 *
 *   for t in 1 2 3 4; do SIM_THEME=$t node tools/simulate.cjs 14 20; done
 *   node tools/check-preview.cjs
 */
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const D = require('./design.cjs')

const ROOT = path.resolve(__dirname, '..')
const SAMPLE_HOUR = 14
const SAMPLE_MINUTE = 20
// A reading that moved shifts the ink in its box; antialiasing does not. Both
// are compared: how much ink each image puts in the box, and where its centre
// of mass sits. Counting differing pixels was tried first and is too blunt —
// misplaced readings and font antialiasing land in the same few percent.
const INK = 90 // luminance: card fills and strokes stay under 45, text is over 130
const MAX_SHIFT = 3 // px between centroids
const MAX_MASS_RATIO = 0.5

// layout.js is the generated ES module the runtime imports; read it rather than
// recomputing the boxes, since recomputing is exactly how the preview drifted.
function loadLayout() {
  const src = fs
    .readFileSync(path.join(ROOT, 'watchface', 'layout.js'), 'utf8')
    .replace(/^export const (\w+)/gm, 'exports.$1 = exports.$1 || undefined; const $1')
  const names = []
  const cleaned = src.replace(/exports\.(\w+) = exports\.\1 \|\| undefined; const (\w+)/g, (_, n) => {
    names.push(n)
    return 'const ' + n
  })
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', cleaned + '\n' + names.map((n) => `exports.${n} = ${n}`).join('\n'))(
    module,
    module.exports
  )
  return module.exports
}

const layout = loadLayout()

// One inspection window per reading, padded so a small shift still shows.
const boxes = []
for (const slot of layout.SLOTS) boxes.push({ name: slot.key, box: slot.value })
for (const cell of layout.PILL_CELLS) boxes.push({ name: cell.key, box: cell.value })

let bad = 0

for (const theme of D.THEMES) {
  const coverPath = path.join(ROOT, 'assets', 'default', `preview_${theme.key}.png`)
  const facePath = path.join(
    ROOT,
    '.render',
    `${theme.key}-${D.pad2(SAMPLE_HOUR)}${D.pad2(SAMPLE_MINUTE)}.png`
  )

  if (!fs.existsSync(facePath)) {
    console.log(`  – ${theme.name}: no harness render at ${SAMPLE_HOUR}:${SAMPLE_MINUTE}, skipped`)
    continue
  }

  const cover = PNG.sync.read(fs.readFileSync(coverPath))
  const face = PNG.sync.read(fs.readFileSync(facePath))
  const off = []

  for (const { name, box } of boxes) {
    const x0 = Math.max(0, box.x - 4)
    const y0 = Math.max(0, box.y - 4)
    const x1 = Math.min(cover.width, box.x + box.w + 4)
    const y1 = Math.min(cover.height, box.y + box.h + 4)

    const ink = (img) => {
      let n = 0
      let sx = 0
      let sy = 0
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * img.width + x) << 2
          const lum = img.data[i] * 0.3 + img.data[i + 1] * 0.6 + img.data[i + 2] * 0.1
          if (lum < INK) continue
          n += 1
          sx += x
          sy += y
        }
      }
      return { n, x: n ? sx / n : 0, y: n ? sy / n : 0 }
    }

    const a = ink(cover)
    const b = ink(face)

    // No ink either side is fine — a blank cell is blank in both.
    if (!a.n && !b.n) continue

    const massRatio = Math.abs(a.n - b.n) / Math.max(a.n, b.n)
    const shift = Math.hypot(a.x - b.x, a.y - b.y)
    if (massRatio > MAX_MASS_RATIO) {
      off.push(`${name} (${(massRatio * 100).toFixed(0)}% less ink)`)
    } else if (shift > MAX_SHIFT) {
      off.push(`${name} (moved ${shift.toFixed(1)}px)`)
    }
  }

  if (off.length) {
    bad += 1
    console.log(`  ✗ ${theme.name}: cover disagrees with the face at — ${off.join(', ')}`)
  } else {
    console.log(`  ✓ ${theme.name}: every reading sits where the face puts it`)
  }
}

process.exit(bad ? 1 : 0)
