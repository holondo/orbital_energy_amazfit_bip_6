/**
 * Orbit Energy — asset generator.
 *
 * Renders every PNG the watchface needs (background, orbital highlight
 * sprites, battery wave frames, temperature digits, AOD layer, icon and
 * preview) and emits watchface/layout.js so the runtime widgets line up with
 * the baked-in artwork.
 *
 *   npm run assets
 *
 * Build-time only: nothing in tools/ is shipped to the watch.
 */

const fs = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')
const D = require('./design.cjs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'assets', 'default')
const FONT_DIR = 'C:/Windows/Fonts'
const FONT_FILES = ['segoeui.ttf', 'seguisb.ttf', 'segoeuib.ttf', 'segoeuisl.ttf']
  .map((f) => path.join(FONT_DIR, f))
  .filter((f) => fs.existsSync(f))

const FAMILY = 'Segoe UI'

let written = 0

// --------------------------------------------------------------- plumbing --

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function render(svg, file) {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: FONT_FILES.length === 0, defaultFontFamily: FAMILY },
    fitTo: { mode: 'original' },
    background: 'rgba(0,0,0,0)',
  })
  const png = resvg.render().asPng()
  const target = path.join(OUT, file)
  mkdirp(path.dirname(target))
  fs.writeFileSync(target, png)
  written += 1
}

function svgDoc(w, h, body, defs) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    body +
    '</svg>'
  )
}

/**
 * Text with a deterministic vertical centre.
 *
 * resvg's dominant-baseline handling varies by version, so the baseline is
 * derived from Segoe UI's cap height (~0.70 em) instead: the optical centre of
 * digits and capitals sits 0.35 em above the baseline.
 */
function text(cx, cy, str, opts = {}) {
  const size = opts.size || 14
  const anchor = opts.anchor || 'middle'
  const weight = opts.weight || 600
  const y = cy + size * 0.35
  return (
    `<text x="${round(cx)}" y="${round(y)}" font-family="${FAMILY}" font-size="${size}" ` +
    `font-weight="${weight}" fill="${opts.color || D.C.white}" text-anchor="${anchor}">` +
    escapeXml(str) +
    '</text>'
  )
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const round = (n) => Math.round(n * 100) / 100

/** Places a 24x24 icon path at (x, y) scaled to `size`. */
function icon(name, x, y, size, color) {
  const s = size / 24
  let body =
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s)})" fill="${color}">` +
    D.ICONS[name] +
    '</g>'
  if (name === 'calendar') {
    body +=
      `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s)})" fill="${D.C.bg}">` +
      D.ICONS.calendarHoles +
      '</g>'
  }
  return body
}

// ------------------------------------------------------------------ dial ---

/** The 24 hour markers and 12 minute markers, as they sit in the background. */
function dialLayer(cx, cy) {
  const { rHour, rMin, hourChipR, minChipR, hourFont, minFont } = D.DIAL
  let out = ''

  for (let h = 0; h < 24; h += 1) {
    const p = D.polar(cx, cy, rHour, h * 15)
    out += `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${hourChipR}" fill="${D.C.chip}"/>`
    out += text(p.x, p.y, D.pad2(h), {
      size: h % 6 === 0 ? hourFont + 1 : hourFont,
      color: D.hourColor(h),
      weight: h % 6 === 0 ? 700 : 600,
    })
  }

  // Only the twelve 5-minute marks: the dense 60-dot ring was visual noise, and
  // the exact minute is spelled out in the highlight chip anyway.
  for (let m = 0; m < 60; m += 5) {
    const p = D.polar(cx, cy, rMin, m * 6)
    out += `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${minChipR}" fill="${D.C.chip}"/>`
    out += text(p.x, p.y, D.pad2(m), {
      size: m % 15 === 0 ? minFont + 1 : minFont,
      color: D.minuteLabelColor(m),
      weight: m % 15 === 0 ? 700 : 600,
    })
  }

  return out
}

// ----------------------------------------------------------------- tiles ---

function tiles() {
  let out = ''

  for (const slot of D.SLOTS) {
    const box = slot.box

    out +=
      `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${D.TILE.r}" ` +
      `fill="${D.C.tileBg}" stroke="${D.C.tileEdge}" stroke-width="1"/>`

    out += icon(
      slot.icon,
      box.x + D.TILE.pad,
      box.y + D.TILE.labelDy - D.TILE.iconSize / 2,
      D.TILE.iconSize,
      slot.iconColor
    )

    if (slot.label) {
      out += text(box.x + D.TILE.labelDx, D.tileLabelY(box), slot.label, {
        size: D.TILE.labelSize,
        color: D.C.label,
        weight: 600,
        anchor: 'start',
      })
    }

    // Only the gauge's track is baked in; the lit part is a runtime widget.
    if (slot.gauge) {
      const g = slot.gauge
      out +=
        `<rect x="${box.x + g.dx}" y="${box.y + g.dy}" width="${g.w}" height="${g.h}" ` +
        `rx="${g.h / 2}" fill="${D.C.barTrack}"/>`
    }
  }

  return out
}

// --------------------------------------------------------------- battery ---

/**
 * Sine wave with a sparkle badge; the leading `pct` (0..1) of it is lit.
 * Returns SVG fragments so the same drawing can be a standalone frame or be
 * embedded in the preview.
 */
function waveParts(pct, id) {
  const { w, h } = D.SLOTS.find((s) => s.wave).wave
  const badge = 13
  const cy = h / 2
  const x1 = w - badge - 3
  const amp = 4.5
  const lambda = 24

  let d = ''
  for (let x = 0; x <= x1; x += 1) {
    d += (x === 0 ? 'M' : 'L') + round(x) + ' ' + round(cy + amp * Math.sin((x / lambda) * Math.PI * 2))
  }

  const stroke = 'fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'
  const sparkle =
    `<g transform="translate(${round(w - badge)} ${cy})">` +
    `<path d="M0 -12 Q1.6 -1.6 12 0 Q1.6 1.6 0 12 Q-1.6 1.6 -12 0 Q-1.6 -1.6 0 -12 Z" fill="${D.C.cyan}"/>` +
    `<g transform="scale(0.54) translate(-12 -12)" fill="${D.C.bg}">${D.ICONS.bolt}</g>` +
    '</g>'

  return {
    defs:
      `<clipPath id="${id}"><rect x="0" y="0" ` +
      `width="${round(Math.max(x1 * pct, 0.001))}" height="${h}"/></clipPath>`,
    body:
      `<path d="${d}" ${stroke} stroke="${D.C.cyanDim}"/>` +
      `<g clip-path="url(#${id})"><path d="${d}" ${stroke} stroke="${D.C.cyan}"/></g>` +
      sparkle,
  }
}

function waveFrame(pct) {
  const { w, h } = D.SLOTS.find((s) => s.wave).wave
  const parts = waveParts(pct, 'lit')
  return svgDoc(w, h, parts.body, parts.defs)
}

// ------------------------------------------------------------------ pill ---

function pillRow() {
  let out =
    `<rect x="${D.PILL.x}" y="${D.PILL.y}" width="${D.PILL.w}" height="${D.PILL.h}" ` +
    `rx="${D.PILL.r}" fill="${D.C.pillBg}" stroke="${D.C.pillEdge}" stroke-width="1"/>`

  for (let i = 0; i < D.PILL.cells.length - 1; i += 1) {
    out +=
      `<rect x="${D.cellDivider(i)}" y="${D.PILL.y + D.PILL.divInset}" width="1" ` +
      `height="${D.PILL.h - D.PILL.divInset * 2}" fill="${D.C.pillDiv}"/>`
  }

  D.PILL.cells.forEach((cell, i) => {
    out += text(D.cellCenter(i), D.PILL.y + D.TILE.labelDy, cell.label, {
      size: D.PILL.labelSize,
      color: D.C.label,
      weight: 600,
    })
  })

  return out
}

// ------------------------------------------------------ highlight sprites --

function highlightSprite(box, r, label, fontSize) {
  const c = box / 2
  return svgDoc(
    box,
    box,
    `<circle cx="${c}" cy="${c}" r="${r + 4}" fill="${D.C.magenta}" opacity="0.13"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="#16091a"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${D.C.magenta}" stroke-width="2.5"/>` +
      text(c, c, label, { size: fontSize, color: D.C.pink, weight: 700 })
  )
}

function aodRingSprite(box, r) {
  const c = box / 2
  return svgDoc(
    box,
    box,
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${D.C.aodText}" stroke-width="2"/>`
  )
}

/**
 * Fully transparent sprite at the exact size of a tap zone. Sized per zone
 * rather than stretched, so the hit area is the whole tile no matter how the
 * runtime scales images.
 */
const hitName = (w, h) => `hit/${w}x${h}.png`

function hitSprite(w, h) {
  return svgDoc(w, h, `<rect width="${w}" height="${h}" fill="none"/>`)
}

// ---------------------------------------------------------- temp digits ----

const TEMP_GLYPH = { w: 17, h: 34 }

function tempGlyph(ch, width) {
  const w = width || TEMP_GLYPH.w
  return svgDoc(
    w,
    TEMP_GLYPH.h,
    text(w / 2, TEMP_GLYPH.h / 2, ch, { size: D.PILL.valueSize, color: D.C.pink, weight: 600 })
  )
}

// -------------------------------------------------------------- layers -----

function backgroundSvg() {
  return svgDoc(
    D.W,
    D.H,
    `<rect width="${D.W}" height="${D.H}" fill="${D.C.bg}"/>` +
      dialLayer(D.DIAL.cx, D.DIAL.cy) +
      tiles() +
      pillRow()
  )
}

function aodSvg() {
  const { cx, cy, rHour, rMin } = D.AOD
  let out = `<rect width="${D.W}" height="${D.H}" fill="${D.C.bg}"/>`

  for (let h = 0; h < 24; h += 1) {
    const p = D.polar(cx, cy, rHour, h * 15)
    const quarter = h % 6 === 0
    out +=
      `<circle cx="${round(p.x)}" cy="${round(p.y)}" ` +
      `r="${quarter ? D.AOD.quarterDotR : D.AOD.hourDotR}" ` +
      `fill="${quarter ? D.C.aodDim : D.C.aodFaint}"/>`
  }

  for (let m = 0; m < 60; m += 5) {
    const p = D.polar(cx, cy, rMin, m * 6)
    out += `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${D.AOD.minDotR}" fill="${D.C.aodFaint}"/>`
  }

  return svgDoc(D.W, D.H, out)
}

// -------------------------------------------------------------- preview ----

/** Full-resolution mock of the running watchface, for app.json's preview. */
function previewSvg(sample) {
  const { cx, cy, hlHourCentre, hlMinCentre } = D.DIAL
  let defs = ''
  let out = backgroundSvg().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

  for (const slot of D.SLOTS) {
    const box = slot.box
    const value = sample[slot.key]

    out += text(box.x + D.TILE.pad, D.tileValueY(box), value, {
      size: slot.value.size,
      color: slot.value.color,
      weight: 700,
      anchor: 'start',
    })

    if (slot.unit) {
      out += text(box.x + slot.unit.dx, D.tileValueY(box) + 6, slot.unit.text || sample[slot.key + 'Unit'], {
        size: slot.unit.size,
        color: slot.unit.color,
        weight: 600,
        anchor: 'start',
      })
    }

    if (slot.gauge) {
      const g = slot.gauge
      const ratio = Math.max(0, Math.min(1, (Number(value) - 50) / 130))
      out +=
        `<rect x="${box.x + g.dx}" y="${box.y + g.dy}" width="${round(g.w * ratio)}" ` +
        `height="${g.h}" rx="${g.h / 2}" fill="${D.C.pink}"/>`
    }

    if (slot.wave) {
      const wave = waveParts(Number(value) / 100, 'plit')
      defs += wave.defs
      out += `<g transform="translate(${box.x + slot.wave.dx} ${box.y + slot.wave.dy})">${wave.body}</g>`
    }
  }

  D.PILL.cells.forEach((cell, i) => {
    out += text(D.cellCenter(i), D.PILL.y + D.PILL.h - D.TILE.valueDy, sample[cell.key], {
      size: D.PILL.valueSize,
      color: D.C.pink,
      weight: 700,
    })
  })

  const ring = (p, r, label, size) =>
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r + 4}" fill="${D.C.magenta}" opacity="0.13"/>` +
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" fill="#16091a"/>` +
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" fill="none" stroke="${D.C.magenta}" stroke-width="2.5"/>` +
    text(p.x, p.y, label, { size, color: D.C.pink, weight: 700 })

  out += ring(
    D.polar(cx, cy, hlHourCentre, sample.hour * 15),
    D.DIAL.hlHourR,
    D.pad2(sample.hour),
    D.DIAL.hlHourFont
  )
  out += ring(
    D.polar(cx, cy, hlMinCentre, sample.minute * 6),
    D.DIAL.hlMinR,
    D.pad2(sample.minute),
    D.DIAL.hlMinFont
  )

  return svgDoc(D.W, D.H, out, defs)
}

// ------------------------------------------------------- runtime layout ----

const hex = (s) => '0x' + s.replace('#', '')

function chipPositions(cx, cy, radius, count, degStep, box) {
  const out = []
  for (let i = 0; i < count; i += 1) {
    const p = D.polar(cx, cy, radius, i * degStep)
    out.push([Math.round(p.x - box / 2), Math.round(p.y - box / 2)])
  }
  return out
}

/** JSON with '#rrggbb' strings turned into the 0xrrggbb literals the UI wants. */
function jsonWithColors(value) {
  return JSON.stringify(value).replace(/"#([0-9a-f]{6})"/g, '0x$1')
}

function emitLayout() {
  const { cx, cy, hlHourCentre, hlMinCentre, hlHourBox, hlMinBox } = D.DIAL

  const slots = D.SLOTS.map((slot) => ({
    key: slot.key,
    app: slot.app,
    tap: Object.assign({ src: hitName(slot.box.w, slot.box.h) }, slot.box),
    value: {
      x: slot.box.x + D.TILE.pad,
      y: Math.round(D.tileValueY(slot.box)) - 18,
      w: slot.value.w,
      h: 36,
      size: slot.value.size,
      color: slot.value.color,
    },
    unit: slot.unit
      ? {
          x: slot.box.x + slot.unit.dx,
          y: Math.round(D.tileValueY(slot.box)) - 6,
          w: slot.unit.w,
          h: 24,
          size: slot.unit.size,
          color: slot.unit.color,
          text: slot.unit.text || '',
        }
      : null,
    gauge: slot.gauge
      ? {
          x: slot.box.x + slot.gauge.dx,
          y: slot.box.y + slot.gauge.dy,
          w: slot.gauge.w,
          h: slot.gauge.h,
        }
      : null,
    wave: slot.wave
      ? {
          x: slot.box.x + slot.wave.dx,
          y: slot.box.y + slot.wave.dy,
          w: slot.wave.w,
          h: slot.wave.h,
        }
      : null,
  }))

  const pillCells = D.PILL.cells.map((cell, i) => ({
    key: cell.key,
    app: cell.app,
    tap: {
      x: Math.round(D.PILL.x + D.cellW * i),
      y: D.PILL.y,
      w: Math.round(D.cellW),
      h: D.PILL.h,
      src: hitName(Math.round(D.cellW), D.PILL.h),
    },
    value: {
      x: Math.round(D.cellCenter(i) - D.cellW / 2),
      y: D.PILL.y + D.PILL.h - D.TILE.valueDy - 18,
      w: Math.round(D.cellW),
      h: 36,
      size: D.PILL.valueSize,
    },
  }))

  const body = `/**
 * GENERATED by tools/build-assets.cjs — do not edit by hand.
 * Keeps the live widgets aligned with the baked-in background artwork.
 */

export const SCREEN = { w: ${D.W}, h: ${D.H} }

export const COLOR = {
  bg: ${hex(D.C.bg)},
  pink: ${hex(D.C.pink)},
  cyan: ${hex(D.C.cyan)},
  white: ${hex(D.C.white)},
  aodText: ${hex(D.C.aodText)},
}

export const IMAGE = {
  bg: 'bg.png',
  aod: 'aod.png',
  hourHighlight: (h) => 'hl/h' + (h < 10 ? '0' + h : h) + '.png',
  minuteHighlight: (m) => 'hl/m' + (m < 10 ? '0' + m : m) + '.png',
  wave: (step) => 'wave/' + (step < 10 ? '0' + step : step) + '.png',
  aodHourRing: 'hl/aod_h.png',
  aodMinuteRing: 'hl/aod_m.png',
}

export const TEMP_FONT = [
  'temp/0.png', 'temp/1.png', 'temp/2.png', 'temp/3.png', 'temp/4.png',
  'temp/5.png', 'temp/6.png', 'temp/7.png', 'temp/8.png', 'temp/9.png',
]
export const TEMP_DEGREE = 'temp/deg.png'
export const TEMP_NEGATIVE = 'temp/neg.png'
export const TEMP_INVALID = 'temp/dash.png'

/** Top-left corner of the ${hlHourBox}x${hlHourBox} hour chip, per hour. */
export const HOUR_POS = ${JSON.stringify(chipPositions(cx, cy, hlHourCentre, 24, 15, hlHourBox))}
/** Top-left corner of the ${hlMinBox}x${hlMinBox} minute chip, per minute. */
export const MINUTE_POS = ${JSON.stringify(chipPositions(cx, cy, hlMinCentre, 60, 6, hlMinBox))}
/** Same sprites, positioned around the centred AOD dial. */
export const AOD_HOUR_POS = ${JSON.stringify(chipPositions(D.AOD.cx, D.AOD.cy, D.AOD.rHour, 24, 15, hlHourBox))}
export const AOD_MINUTE_POS = ${JSON.stringify(chipPositions(D.AOD.cx, D.AOD.cy, D.AOD.rMin, 60, 6, hlMinBox))}

export const HL_HOUR_BOX = ${hlHourBox}
export const HL_MIN_BOX = ${hlMinBox}

/**
 * One entry per tile: the live value box, its optional trailing unit, the
 * heart-rate gauge or battery wave, the tap target, and the name of the system
 * app that a tap opens.
 */
export const SLOTS = ${jsonWithColors(slots)}

/** The four cells inside the bottom pill, same shape as SLOTS. */
export const PILL_CELLS = ${jsonWithColors(pillCells)}

export const WAVE_STEPS = ${D.BAT.waveSteps}

export const AOD = {
  x: ${D.AOD.x},
  w: ${D.AOD.w},
  timeY: ${D.AOD.timeY},
  timeH: ${D.AOD.timeH},
  timeSize: ${D.AOD.timeSize},
  dateY: ${D.AOD.dateY},
  dateH: ${D.AOD.dateH},
  dateSize: ${D.AOD.dateSize},
}
`

  fs.writeFileSync(path.join(ROOT, 'watchface', 'layout.js'), body)
}

// ----------------------------------------------------------------- main ----

function main() {
  const gap = D.checkGeometry()
  console.log(`  marker clearance: ${gap}px`)
  if (FONT_FILES.length === 0) {
    console.warn('! Segoe UI not found in ' + FONT_DIR + ', falling back to system font matching')
  }
  mkdirp(OUT)

  render(backgroundSvg(), 'bg.png')
  render(aodSvg(), 'aod.png')

  const hitSizes = new Set()
  D.SLOTS.forEach((s) => hitSizes.add(s.box.w + 'x' + s.box.h))
  hitSizes.add(Math.round(D.cellW) + 'x' + D.PILL.h)
  hitSizes.forEach((size) => {
    const [w, h] = size.split('x').map(Number)
    render(hitSprite(w, h), hitName(w, h))
  })

  for (let h = 0; h < 24; h += 1) {
    render(
      highlightSprite(D.DIAL.hlHourBox, D.DIAL.hlHourR, D.pad2(h), D.DIAL.hlHourFont),
      `hl/h${D.pad2(h)}.png`
    )
  }
  for (let m = 0; m < 60; m += 1) {
    render(
      highlightSprite(D.DIAL.hlMinBox, D.DIAL.hlMinR, D.pad2(m), D.DIAL.hlMinFont),
      `hl/m${D.pad2(m)}.png`
    )
  }
  render(aodRingSprite(D.DIAL.hlHourBox, D.DIAL.hlHourR), 'hl/aod_h.png')
  render(aodRingSprite(D.DIAL.hlMinBox, D.DIAL.hlMinR), 'hl/aod_m.png')

  for (let i = 0; i < D.BAT.waveSteps; i += 1) {
    render(waveFrame(i / (D.BAT.waveSteps - 1)), `wave/${D.pad2(i)}.png`)
  }

  for (let d = 0; d < 10; d += 1) render(tempGlyph(String(d)), `temp/${d}.png`)
  render(tempGlyph('°', 12), 'temp/deg.png')
  render(tempGlyph('-', 12), 'temp/neg.png')
  render(tempGlyph('–', 17), 'temp/dash.png')

  const preview = previewSvg({
    hr: '87',
    distance: '3.50',
    steps: '4505',
    date: 'TUE 30',
    stand: '8',
    standUnit: '/12',
    battery: '65',
    temp: '23°',
    kcal: '450',
    stress: '56',
    pai: '22',
    hour: 18,
    minute: 19,
  })
  render(preview, 'preview.png')
  render(preview, 'icon.png')

  emitLayout()
  console.log(`✓ ${written} PNGs written to assets/default`)
  console.log('✓ watchface/layout.js regenerated')
}

main()
