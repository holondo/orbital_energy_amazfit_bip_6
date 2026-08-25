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
  const extra = opts.letterSpacing ? ` letter-spacing="${opts.letterSpacing}"` : ''
  const opacity = opts.opacity != null ? ` opacity="${opts.opacity}"` : ''
  return (
    `<text x="${round(cx)}" y="${round(y)}" font-family="${FAMILY}" font-size="${size}" ` +
    `font-weight="${weight}" fill="${opts.color || D.C.white}" text-anchor="${anchor}"${extra}${opacity}>` +
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
  const shape = D.ICONS[name]
  let body = `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s)})" fill="${color}">${shape}</g>`
  if (name === 'calendar') {
    body += `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s)})" fill="${D.C.bg}">${D.ICONS.calendarHoles}</g>`
  }
  return body
}

// ------------------------------------------------------------------ dial ---

/** The 24 hour markers and 60 minute markers, as they sit in the background. */
function dialLayer() {
  const { cx, cy, rHour, rMin, hourChipR, hourFont, minFont, minDotR } = D.DIAL
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

  for (let m = 0; m < 60; m += 1) {
    const p = D.polar(cx, cy, rMin, m * 6)
    if (m % 5 === 0) {
      out += text(p.x, p.y, D.pad2(m), {
        size: minFont,
        color: D.minuteLabelColor(m),
        weight: 600,
      })
    } else {
      const r = m % 5 === 2 || m % 5 === 3 ? minDotR + 0.5 : minDotR
      out += `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${round(r)}" fill="${D.minuteDotColor(m)}"/>`
    }
  }

  return out
}

// ----------------------------------------------------------- left column ---

function leftColumn() {
  let out = ''

  D.ROWS.forEach((row, i) => {
    const y0 = D.rowY(i)
    out += icon(row.icon, D.COL.x, y0, D.COL.iconSize, row.color)

    if (row.label) {
      out += text(D.COL.labelX, y0 + D.COL.iconSize / 2, row.label, {
        size: D.COL.labelSize,
        color: D.C.label,
        weight: 600,
        anchor: 'start',
      })
    } else {
      // heart-rate zone bar sits where the label would be
      const bar = D.HR_BAR
      out +=
        `<rect x="${bar.x}" y="${y0 + bar.dy}" width="${bar.w}" height="${bar.h}" ` +
        `rx="${bar.h / 2}" fill="${D.C.barTrack}"/>`
    }

    out +=
      `<rect x="${D.COL.x}" y="${y0 + 48}" width="${D.COL.w}" height="1" fill="${D.C.divider}"/>`
  })

  return out
}

// --------------------------------------------------------------- battery ---

function batteryRow() {
  return icon('bolt', D.COL.x - 2, D.BAT.y, D.BAT.iconSize, D.C.cyan)
}

/**
 * Sine wave with a sparkle badge; the leading `pct` (0..1) of it is lit.
 * Returns SVG fragments so the same drawing can be a standalone frame or be
 * embedded in the preview.
 */
function waveParts(pct, id) {
  const { waveW, waveH } = D.BAT
  const badge = 15
  const cy = waveH / 2
  const x0 = 0
  const x1 = waveW - badge - 4
  const amp = 5
  const lambda = 29

  let d = ''
  for (let x = x0; x <= x1; x += 1) {
    const y = cy + amp * Math.sin(((x - x0) / lambda) * Math.PI * 2)
    d += (x === x0 ? 'M' : 'L') + round(x) + ' ' + round(y)
  }

  const lit = x0 + (x1 - x0) * pct
  const stroke = 'fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'

  const sparkle =
    `<g transform="translate(${round(waveW - badge)} ${cy})">` +
    `<path d="M0 -14 Q1.8 -1.8 14 0 Q1.8 1.8 0 14 Q-1.8 1.8 -14 0 Q-1.8 -1.8 0 -14 Z" fill="${D.C.cyan}"/>` +
    `<g transform="scale(0.62) translate(-12 -12)" fill="${D.C.bg}">${D.ICONS.bolt}</g>` +
    `</g>`

  return {
    defs: `<clipPath id="${id}"><rect x="0" y="0" width="${round(Math.max(lit, 0.001))}" height="${waveH}"/></clipPath>`,
    body:
      `<path d="${d}" ${stroke} stroke="${D.C.cyanDim}"/>` +
      `<g clip-path="url(#${id})"><path d="${d}" ${stroke} stroke="${D.C.cyan}"/></g>` +
      sparkle,
  }
}

function waveFrame(pct) {
  const parts = waveParts(pct, 'lit')
  return svgDoc(D.BAT.waveW, D.BAT.waveH, parts.body, parts.defs)
}

// ------------------------------------------------------------------ pill ---

function pillRow() {
  let out =
    `<rect x="${D.PILL.x}" y="${D.PILL.y}" width="${D.PILL.w}" height="${D.PILL.h}" ` +
    `rx="${D.PILL.r}" fill="${D.C.pillBg}" stroke="${D.C.pillEdge}" stroke-width="1"/>`

  for (let i = 0; i < 3; i += 1) {
    out +=
      `<rect x="${D.cellDivider(i)}" y="${D.PILL.divTop}" width="1" ` +
      `height="${D.PILL.divBottom - D.PILL.divTop}" fill="${D.C.pillDiv}"/>`
  }

  D.PILL.cells.forEach((label, i) => {
    out += text(D.cellCenter(i), D.PILL.labelY + D.PILL.labelH / 2, label, {
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
    `<circle cx="${c}" cy="${c}" r="${r + 3}" fill="${D.C.magenta}" opacity="0.16"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="#160a18"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${D.C.magenta}" stroke-width="2"/>` +
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

// ---------------------------------------------------------- temp digits ----

const TEMP_GLYPH = { w: 15, h: 28 }

function tempGlyph(ch, width) {
  const w = width || TEMP_GLYPH.w
  return svgDoc(
    w,
    TEMP_GLYPH.h,
    text(w / 2, TEMP_GLYPH.h / 2, ch, {
      size: D.PILL.valueSize,
      color: D.C.pink,
      weight: 600,
    })
  )
}

// -------------------------------------------------------------- layers -----

function backgroundSvg() {
  return svgDoc(
    D.W,
    D.H,
    `<rect width="${D.W}" height="${D.H}" fill="${D.C.bg}"/>` +
      dialLayer() +
      leftColumn() +
      batteryRow() +
      pillRow()
  )
}

function aodSvg() {
  const { rHour, rMin } = D.DIAL
  const cx = D.AOD.cx
  const cy = D.AOD.cy
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
  const { cx, cy, rHour, rMin } = D.DIAL
  let defs = ''
  let out = backgroundSvg().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

  // live values, left column
  const v = (i, str, opts) => {
    const y0 = D.rowY(i)
    return text(opts.x, y0 + 21 + (opts.h || 30) / 2, str, {
      size: opts.size || D.COL.valueSize,
      color: opts.color || D.C.pink,
      weight: 700,
      anchor: 'start',
    })
  }

  const bar = D.HR_BAR
  const ratio = Math.max(0, Math.min(1, (sample.hr - 50) / 130))
  out +=
    `<rect x="${bar.x}" y="${D.rowY(0) + bar.dy}" width="${round(bar.w * ratio)}" ` +
    `height="${bar.h}" rx="${bar.h / 2}" fill="${D.C.pink}"/>`

  const unit = (i, x, str, color, size) =>
    text(x, D.rowY(i) + 21 + 18, str, { size, color, weight: 600, anchor: 'start' })

  out += v(0, String(sample.hr), { x: D.COL.x })
  out += unit(0, D.UNIT_BOX.hr.x, 'BPM', D.C.white, D.UNIT_BOX.hr.size)
  out += v(1, sample.distance, { x: D.COL.x })
  out += unit(1, D.UNIT_BOX.distance.x, 'KM', D.C.blue, D.UNIT_BOX.distance.size)
  out += v(2, String(sample.steps), { x: D.COL.x })
  out += v(3, sample.date, { x: D.COL.x, size: 25 })
  out += v(4, String(sample.stand), { x: D.COL.x })
  out += unit(4, D.UNIT_BOX.stand.x, '/' + sample.standTarget, D.C.cyan, D.UNIT_BOX.stand.size)

  // battery
  out += text(D.BAT.valueX, D.BAT.y + 15, String(sample.battery), {
    size: D.BAT.valueSize,
    color: D.C.cyan,
    weight: 700,
    anchor: 'start',
  })
  const wave = waveParts(sample.battery / 100, 'plit')
  defs += wave.defs
  out += `<g transform="translate(${D.BAT.waveX} ${D.BAT.waveY})">${wave.body}</g>`

  // pill values
  const pillValues = [sample.temp + '°', String(sample.kcal), String(sample.stress), String(sample.pai)]
  pillValues.forEach((str, i) => {
    out += text(D.cellCenter(i), D.PILL.valueY + D.PILL.valueH / 2, str, {
      size: D.PILL.valueSize,
      color: D.C.pink,
      weight: 700,
    })
  })

  // highlight rings
  const hp = D.polar(cx, cy, rHour, sample.hour * 15)
  const mp = D.polar(cx, cy, rMin, sample.minute * 6)
  const ring = (p, r, label, size) =>
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r + 3}" fill="${D.C.magenta}" opacity="0.16"/>` +
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" fill="#160a18"/>` +
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" fill="none" stroke="${D.C.magenta}" stroke-width="2"/>` +
    text(p.x, p.y, label, { size, color: D.C.pink, weight: 700 })

  out += ring(hp, D.DIAL.hlHourR, D.pad2(sample.hour), D.DIAL.hlHourFont)
  out += ring(mp, D.DIAL.hlMinR, D.pad2(sample.minute), D.DIAL.hlMinFont)

  return svgDoc(D.W, D.H, out, defs)
}

// ------------------------------------------------------- runtime layout ----

const hex = (s) => '0x' + s.replace('#', '')

function emitLayout() {
  const { cx, cy, rHour, rMin, hlHourBox, hlMinBox } = D.DIAL

  const hourPos = []
  for (let h = 0; h < 24; h += 1) {
    const p = D.polar(cx, cy, rHour, h * 15)
    hourPos.push([Math.round(p.x - hlHourBox / 2), Math.round(p.y - hlHourBox / 2)])
  }

  const minPos = []
  for (let m = 0; m < 60; m += 1) {
    const p = D.polar(cx, cy, rMin, m * 6)
    minPos.push([Math.round(p.x - hlMinBox / 2), Math.round(p.y - hlMinBox / 2)])
  }

  const aodHourPos = []
  const aodMinPos = []
  for (let h = 0; h < 24; h += 1) {
    const p = D.polar(D.AOD.cx, D.AOD.cy, rHour, h * 15)
    aodHourPos.push([Math.round(p.x - hlHourBox / 2), Math.round(p.y - hlHourBox / 2)])
  }
  for (let m = 0; m < 60; m += 1) {
    const p = D.polar(D.AOD.cx, D.AOD.cy, rMin, m * 6)
    aodMinPos.push([Math.round(p.x - hlMinBox / 2), Math.round(p.y - hlMinBox / 2)])
  }

  const rows = D.ROWS.map((r, i) => ({ key: r.key, y: D.rowY(i) }))
  const valueY = (i) => D.rowY(i) + 21

  const body = `/**
 * GENERATED by tools/build-assets.cjs — do not edit by hand.
 * Keeps the live widgets aligned with the baked-in background artwork.
 */

export const SCREEN = { w: ${D.W}, h: ${D.H} }

export const COLOR = {
  bg: ${hex(D.C.bg)},
  pink: ${hex(D.C.pink)},
  magenta: ${hex(D.C.magenta)},
  cyan: ${hex(D.C.cyan)},
  blue: ${hex(D.C.blue)},
  sky: ${hex(D.C.sky)},
  violet: ${hex(D.C.violet)},
  white: ${hex(D.C.white)},
  label: ${hex(D.C.label)},
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

/** Top-left corner of the ${hlHourBox}x${hlHourBox} hour highlight sprite, per hour. */
export const HOUR_POS = ${JSON.stringify(hourPos)}
/** Top-left corner of the ${hlMinBox}x${hlMinBox} minute highlight sprite, per minute. */
export const MINUTE_POS = ${JSON.stringify(minPos)}

/** Same sprites, positioned around the centred AOD dial. */
export const AOD_HOUR_POS = ${JSON.stringify(aodHourPos)}
export const AOD_MINUTE_POS = ${JSON.stringify(aodMinPos)}

export const HL_HOUR_BOX = ${hlHourBox}
export const HL_MIN_BOX = ${hlMinBox}

export const COL = {
  x: ${D.COL.x},
  w: ${D.COL.w},
  valueSize: ${D.COL.valueSize},
  unitSize: ${D.COL.unitSize},
  valueH: 30,
  unitH: 22,
  /** the unit sits ~8px lower so its baseline lines up with the big value */
  unitDy: 8,
}

/** y of each row's value line, keyed by metric. */
export const ROW = {
${rows.map((r, i) => `  ${r.key}: ${valueY(i)},`).join('\n')}
}

/** Left-aligned boxes for each live value. */
export const VALUE_BOX = ${JSON.stringify(D.VALUE_BOX)}
/** Left-aligned boxes for the trailing units (BPM, KM, /12). */
export const UNIT_BOX = ${JSON.stringify(D.UNIT_BOX)}

export const HR_BAR = { x: ${D.HR_BAR.x}, y: ${D.rowY(0) + D.HR_BAR.dy}, w: ${D.HR_BAR.w}, h: ${D.HR_BAR.h} }

export const BAT = {
  valueX: ${D.BAT.valueX},
  valueY: ${D.BAT.y},
  valueW: ${D.BAT.valueW},
  valueH: 30,
  valueSize: ${D.BAT.valueSize},
  waveX: ${D.BAT.waveX},
  waveY: ${D.BAT.waveY},
  waveW: ${D.BAT.waveW},
  waveH: ${D.BAT.waveH},
  waveSteps: ${D.BAT.waveSteps},
}

export const PILL = {
  valueY: ${D.PILL.valueY},
  valueH: ${D.PILL.valueH},
  valueSize: ${D.PILL.valueSize},
  cellW: ${Math.round(D.cellW)},
  centers: ${JSON.stringify([0, 1, 2, 3].map((i) => D.cellCenter(i)))},
}

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
  if (FONT_FILES.length === 0) {
    console.warn('! Segoe UI not found in ' + FONT_DIR + ', falling back to system font matching')
  }
  mkdirp(OUT)

  render(backgroundSvg(), 'bg.png')
  render(aodSvg(), 'aod.png')

  for (let h = 0; h < 24; h += 1) {
    render(highlightSprite(D.DIAL.hlHourBox, D.DIAL.hlHourR, D.pad2(h), D.DIAL.hlHourFont), `hl/h${D.pad2(h)}.png`)
  }
  for (let m = 0; m < 60; m += 1) {
    render(highlightSprite(D.DIAL.hlMinBox, D.DIAL.hlMinR, D.pad2(m), D.DIAL.hlMinFont), `hl/m${D.pad2(m)}.png`)
  }
  render(aodRingSprite(D.DIAL.hlHourBox, D.DIAL.hlHourR), 'hl/aod_h.png')
  render(aodRingSprite(D.DIAL.hlMinBox, D.DIAL.hlMinR), 'hl/aod_m.png')

  for (let i = 0; i < D.BAT.waveSteps; i += 1) {
    render(waveFrame(i / (D.BAT.waveSteps - 1)), `wave/${D.pad2(i)}.png`)
  }

  for (let d = 0; d < 10; d += 1) render(tempGlyph(String(d)), `temp/${d}.png`)
  render(tempGlyph('°', 11), 'temp/deg.png')
  render(tempGlyph('-', 11), 'temp/neg.png')
  render(tempGlyph('–', 15), 'temp/dash.png')

  const preview = previewSvg({
    hr: 87,
    distance: '3.50',
    steps: 4505,
    date: 'TUE 30',
    stand: 12,
    standTarget: 12,
    battery: 65,
    temp: 23,
    kcal: 450,
    stress: 56,
    pai: 22,
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
