// Crops a region of a PNG and nearest-neighbour upscales it, for design review.
const fs = require('fs')
const { PNG } = require('pngjs')

const [, , src, x0, y0, w, h, scale, dst] = process.argv
const s = Number(scale || 3)
const png = PNG.sync.read(fs.readFileSync(src))
const out = new PNG({ width: Number(w) * s, height: Number(h) * s })

for (let y = 0; y < out.height; y++) {
  for (let x = 0; x < out.width; x++) {
    const sx = Number(x0) + Math.floor(x / s)
    const sy = Number(y0) + Math.floor(y / s)
    const si = (sy * png.width + sx) << 2
    const di = (y * out.width + x) << 2
    for (let c = 0; c < 4; c++) out.data[di + c] = png.data[si + c]
  }
}
fs.writeFileSync(dst, PNG.sync.write(out))
console.log('wrote', dst)
