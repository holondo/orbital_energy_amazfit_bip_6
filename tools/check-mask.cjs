/**
 * Checks a render against the panel's real mask.
 *
 * reference/screenshot-135404033.png is a device screenshot with an alpha
 * channel, so its transparent region is exactly what the glass hides. Anything
 * this face draws out there is invisible on the watch — which is how a clipped
 * heart rate shipped twice. SCREEN_R is fitted from the same mask, but a fitted
 * radius is a model; this compares against the pixels themselves.
 *
 *   node tools/check-mask.cjs [render.png ...]
 */
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const ROOT = path.resolve(__dirname, '..')
const MASK = path.join(ROOT, 'reference', 'screenshot-135404033.png')

if (!fs.existsSync(MASK)) {
  console.error('no device mask at ' + MASK)
  process.exit(2)
}

const mask = PNG.sync.read(fs.readFileSync(MASK))
const hidden = (x, y) => mask.data[((y * mask.width + x) << 2) + 3] < 128

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node tools/check-mask.cjs <render.png> ...')
  process.exit(2)
}

let bad = 0

for (const file of files) {
  const img = PNG.sync.read(fs.readFileSync(file))
  if (img.width !== mask.width || img.height !== mask.height) {
    console.log(`  ✗ ${path.basename(file)} is ${img.width}x${img.height}, mask is ${mask.width}x${mask.height}`)
    bad += 1
    continue
  }

  // Only readings count. Card artwork is *meant* to overrun the glass — the
  // panel clips it, which is how a card ends up following the arc exactly. Card
  // fills and strokes sit below luminance 45 in every theme; the dimmest text
  // is over 130, so the gap is wide and this threshold is not delicate.
  const INK = 90
  let lost = 0
  let worst = null
  const shown = new PNG({ width: img.width, height: img.height })
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const i = (y * img.width + x) << 2
      if (!hidden(x, y)) {
        shown.data[i] = img.data[i]
        shown.data[i + 1] = img.data[i + 1]
        shown.data[i + 2] = img.data[i + 2]
        shown.data[i + 3] = 255
        continue
      }
      shown.data[i + 3] = 0
      const lum = img.data[i] * 0.3 + img.data[i + 1] * 0.6 + img.data[i + 2] * 0.1
      if (lum < INK) continue
      lost += 1
      if (!worst || lum > worst.lum) worst = { x, y, lum: Math.round(lum) }
    }
  }

  // The composite is what the watch actually shows: the render with the panel's
  // own mask applied. Worth looking at even when the check passes.
  const out = file.replace(/\.png$/, '-masked.png')
  fs.writeFileSync(out, PNG.sync.write(shown))

  if (lost) {
    bad += 1
    console.log(
      `  ✗ ${path.basename(file)}: ${lost} lit pixels behind the bezel ` +
        `(brightest at ${worst.x},${worst.y}) -> ${path.basename(out)}`
    )
  } else {
    console.log(`  ✓ ${path.basename(file)}: no reading falls outside the glass`)
  }
}

process.exit(bad ? 1 : 0)
