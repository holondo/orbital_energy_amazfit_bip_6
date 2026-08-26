/**
 * Measures the ink extents of a region in a device screenshot.
 *
 * The watch renders text with its own system font, not the one the generator
 * draws with, so box widths are sized from real measurements taken here rather
 * than from estimates.
 *
 *   node tools/measure-text.cjs <shot.png> '[["label",x,y,w,h],...]'
 */
const fs = require('fs')
const { PNG } = require('pngjs')

const png = PNG.sync.read(fs.readFileSync(process.argv[2]))

for (const [label, x0, y0, w, h] of JSON.parse(process.argv[3])) {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * png.width + x) << 2
      const lum = png.data[i] + png.data[i + 1] + png.data[i + 2]
      if (lum < 150) continue // ignore the tile background
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) { console.log(label.padEnd(16), 'nothing found'); continue }
  console.log(
    label.padEnd(16),
    'ink ' + (maxX - minX + 1) + 'x' + (maxY - minY + 1),
    ' at x ' + minX + '..' + maxX + '  y ' + minY + '..' + maxY
  )
}
