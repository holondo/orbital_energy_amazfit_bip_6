// Composites what the watch *should* draw over a region and diffs it against a
// device screenshot, so rendering bugs on hardware become visible.
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const [, , shotPath, x0, y0, w, h, scale, out] = process.argv
const S = Number(scale || 3)
const X = Number(x0), Y = Number(y0), W = Number(w), H = Number(h)

const ASSETS = path.resolve(__dirname, '..', 'assets', 'default')
const read = (f) => PNG.sync.read(fs.readFileSync(f))
const shot = read(shotPath)
const bg = read(path.join(ASSETS, 'bg.png'))

// expected = bg with the sprites the runtime places on top
const expected = new PNG({ width: bg.width, height: bg.height })
bg.data.copy(expected.data)

for (const [file, sx, sy] of JSON.parse(process.env.SPRITES || '[]')) {
  const s = read(path.join(ASSETS, file))
  for (let yy = 0; yy < s.height; yy++) {
    for (let xx = 0; xx < s.width; xx++) {
      const si = (yy * s.width + xx) << 2
      const a = s.data[si + 3] / 255
      if (!a) continue
      const dx = sx + xx, dy = sy + yy
      if (dx < 0 || dy < 0 || dx >= bg.width || dy >= bg.height) continue
      const di = (dy * bg.width + dx) << 2
      for (let c = 0; c < 3; c++) {
        expected.data[di + c] = Math.round(s.data[si + c] * a + expected.data[di + c] * (1 - a))
      }
    }
  }
}

// three panels: expected | device | difference
const png = new PNG({ width: W * S * 3 + 16, height: H * S })
png.data.fill(40)
const put = (src, panel) => {
  for (let yy = 0; yy < H * S; yy++) {
    for (let xx = 0; xx < W * S; xx++) {
      const sx = X + Math.floor(xx / S), sy = Y + Math.floor(yy / S)
      const si = (sy * src.width + sx) << 2
      const di = (yy * png.width + panel * (W * S + 8) + xx) << 2
      for (let c = 0; c < 4; c++) png.data[di + c] = src.data[si + c]
    }
  }
}
put(expected, 0)
put(shot, 1)

let differing = 0
for (let yy = 0; yy < H * S; yy++) {
  for (let xx = 0; xx < W * S; xx++) {
    const sx = X + Math.floor(xx / S), sy = Y + Math.floor(yy / S)
    const ei = (sy * expected.width + sx) << 2
    const si = (sy * shot.width + sx) << 2
    const d = Math.abs(expected.data[ei] - shot.data[si]) +
      Math.abs(expected.data[ei + 1] - shot.data[si + 1]) +
      Math.abs(expected.data[ei + 2] - shot.data[si + 2])
    const di = (yy * png.width + 2 * (W * S + 8) + xx) << 2
    const hit = d > 60
    if (hit && xx % S === 0 && yy % S === 0) differing++
    png.data[di] = hit ? 255 : 0
    png.data[di + 1] = hit ? 0 : 0
    png.data[di + 2] = hit ? 0 : 0
    png.data[di + 3] = 255
  }
}

fs.writeFileSync(out, PNG.sync.write(png))
console.log(`differing pixels in region: ${differing} / ${W * H}`)
