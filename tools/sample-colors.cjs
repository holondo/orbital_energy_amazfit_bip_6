const fs = require('fs')
const { PNG } = require('pngjs')

const png = PNG.sync.read(fs.readFileSync(process.argv[2]))
const radius = Number(process.argv[4] || 12)
const mode = process.argv[5] || 'saturated'
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

function score(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (mode === 'bright') return r + g + b
  return (max - min) * 2 + max // favour saturated, then bright
}

for (const [name, nx, ny] of JSON.parse(process.argv[3])) {
  const cx = Math.round(nx * png.width)
  const cy = Math.round(ny * png.height)
  let best = null
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue
      const i = (y * png.width + x) << 2
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]
      const s = score(r, g, b)
      if (!best || s > best.s) best = { r, g, b, s, x, y }
    }
  }
  console.log(name.padEnd(18), hex(best.r, best.g, best.b), `@(${best.x},${best.y})`)
}
