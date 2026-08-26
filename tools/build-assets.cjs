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
const { PNG } = require('pngjs')
const D = require('./design.cjs')

/**
 * The generator draws one theme at a time; `T` is whichever is being rendered.
 * Every colour below reads through it, so adding a theme costs nothing here.
 */
let T = D.THEMES[0]

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'assets', 'default')
const FONT_DIR = 'C:/Windows/Fonts'
const FONT_FILES = ['segoeui.ttf', 'seguisb.ttf', 'segoeuib.ttf', 'segoeuisl.ttf']
  .map((f) => path.join(FONT_DIR, f))
  .filter((f) => fs.existsSync(f))

const FAMILY = 'Segoe UI'

/**
 * The marker digits use their own face (see DIAL.markerFont), vendored under
 * tools/fonts/ with its licence. Nothing on the watch resolves it — the
 * markers are rasterised into sprites here.
 */
const MARKER_FONT_FILE = path.join(__dirname, 'fonts', 'InstrumentSerif-Regular.ttf')
if (!fs.existsSync(MARKER_FONT_FILE)) {
  throw new Error('missing marker font: ' + MARKER_FONT_FILE)
}
FONT_FILES.push(MARKER_FONT_FILE)

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
  // Each face sits differently on its baseline; the caller passes the offset
  // measured for it, defaulting to Segoe UI's.
  const y = cy + size * (opts.baseline || 0.35)
  const family = opts.family || FAMILY
  const fill = opts.color || T.C.white
  // A stroke in the fill colour, painted underneath, is how a face with no
  // bold weight gets one.
  const bolder = opts.stroke
    ? ` stroke="${fill}" stroke-width="${opts.stroke}" paint-order="stroke" stroke-linejoin="round"`
    : ''
  return (
    `<text x="${round(cx)}" y="${round(y)}" font-family="${family}" font-size="${size}" ` +
    `font-weight="${weight}" fill="${fill}"${bolder} text-anchor="${anchor}">` +
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
      `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s)})" fill="${T.C.bg}">` +
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
    out += `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${hourChipR}" fill="${T.C.chip}"/>`
    out += text(p.x, p.y, D.pad2(h), {
      size: h % 6 === 0 ? hourFont + 1 : hourFont,
      color: D.hourColor(T, h),
      weight: h % 6 === 0 ? 700 : 600,
    })
  }

  // Only the twelve 5-minute marks: the dense 60-dot ring was visual noise, and
  // the exact minute is spelled out in the highlight chip anyway.
  for (let m = 0; m < 60; m += 5) {
    const p = D.polar(cx, cy, rMin, m * 6)
    out += `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${minChipR}" fill="${T.C.chip}"/>`
    out += text(p.x, p.y, D.pad2(m), {
      size: m % 15 === 0 ? minFont + 1 : minFont,
      color: D.minuteLabelColor(T, m),
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
      `fill="${T.C.tileBg}" stroke="${T.C.tileEdge}" stroke-width="1"/>`

    out += icon(
      slot.icon,
      box.x + D.TILE.pad,
      box.y + D.TILE.labelDy - D.TILE.iconSize / 2,
      D.TILE.iconSize,
      T.C[slot.iconColor]
    )

    if (slot.label) {
      out += text(box.x + D.TILE.labelDx, D.tileLabelY(box), slot.label, {
        size: D.TILE.labelSize,
        color: T.C.label,
        weight: 600,
        anchor: 'start',
      })
    }

    // Meters are drawn entirely by their own image strip at runtime; the
    // background only carries the unlit track so the tile is never empty.
    if (slot.meter && slot.meter.name === 'hr') {
      const m = slot.meter
      out +=
        `<rect x="${box.x + m.dx}" y="${box.y + m.dy}" width="${m.w}" height="${m.h}" ` +
        `rx="${m.h / 2}" fill="${T.C.barTrack}"/>`
    }
  }

  return out
}

// --------------------------------------------------------------- battery ---

const meterOf = (name) => D.SLOTS.find((s) => s.meter && s.meter.name === name).meter

/** Heart-rate zone bar: a rounded track with the leading `pct` filled. */
function hrParts(pct) {
  const { w, h } = meterOf('hr')
  const r = h / 2
  const lit = Math.max(Math.round(w * pct), pct > 0 ? h : 0)
  return {
    defs: '',
    body:
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${T.C.barTrack}"/>` +
      (lit > 0 ? `<rect x="0" y="0" width="${lit}" height="${h}" rx="${r}" fill="${T.C.primary}"/>` : ''),
  }
}

/**
 * Sine wave with a sparkle badge; the leading `pct` (0..1) of it is lit.
 * Returns SVG fragments so the same drawing can be a standalone frame or be
 * embedded in the preview.
 */
function waveParts(pct, id) {
  const { w, h } = meterOf('battery')
  const cy = h / 2
  const x1 = w - 2
  const amp = 4.5
  const lambda = 24

  let d = ''
  for (let x = 0; x <= x1; x += 1) {
    d += (x === 0 ? 'M' : 'L') + round(x) + ' ' + round(cy + amp * Math.sin((x / lambda) * Math.PI * 2))
  }

  const stroke = 'fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'

  return {
    defs:
      `<clipPath id="${id}"><rect x="0" y="0" ` +
      `width="${round(Math.max(x1 * pct, 0.001))}" height="${h}"/></clipPath>`,
    body:
      `<path d="${d}" ${stroke} stroke="${T.C.accentDim}"/>` +
      `<g clip-path="url(#${id})"><path d="${d}" ${stroke} stroke="${T.C.accent}"/></g>`,
  }
}

const meterParts = (name, pct, id) => (name === 'hr' ? hrParts(pct) : waveParts(pct, id))

function meterFrame(name, pct) {
  const { w, h } = meterOf(name)
  const parts = meterParts(name, pct, 'lit')
  return svgDoc(w, h, parts.body, parts.defs)
}

// ------------------------------------------------------------------ pill ---

function pillRow() {
  let out =
    `<rect x="${D.PILL.x}" y="${D.PILL.y}" width="${D.PILL.w}" height="${D.PILL.h}" ` +
    `rx="${D.PILL.r}" fill="${T.C.pillBg}" stroke="${T.C.pillEdge}" stroke-width="1"/>`

  for (let i = 0; i < D.PILL.cells.length - 1; i += 1) {
    out +=
      `<rect x="${D.cellDivider(i)}" y="${D.PILL.y + D.PILL.divInset}" width="1" ` +
      `height="${D.PILL.h - D.PILL.divInset * 2}" fill="${T.C.pillDiv}"/>`
  }

  D.PILL.cells.forEach((cell, i) => {
    out += text(D.cellCenter(i), D.PILL.y + D.TILE.labelDy, cell.label, {
      size: D.PILL.labelSize,
      color: T.C.label,
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
    `<circle cx="${c}" cy="${c}" r="${r + 4}" fill="${T.C.marker}" opacity="0.13"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="${T.C.markerFill}"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${T.C.marker}" stroke-width="2.5"/>` +
      text(c, c, label, {
        size: fontSize,
        color: T.C.primary,
        weight: 400,
        family: D.DIAL.markerFont,
        baseline: D.DIAL.markerBaseline,
        stroke: D.DIAL.markerStroke,
      })
  )
}

function aodRingSprite(box, r) {
  const c = box / 2
  return svgDoc(
    box,
    box,
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${T.C.aodText}" stroke-width="2"/>`
  )
}

/**
 * The overlay and hint backdrop WATCHFACE_EDIT_BG expects. The stock faces
 * pass both (highlight.png / tip.png); leaving them out is the difference
 * between the editor initialising and quietly doing nothing. Transparent, so
 * they add no chrome of their own.
 */
function editorChromeSvg(w, h) {
  return svgDoc(w, h, `<rect width="${w}" height="${h}" fill="none"/>`)
}

/**
 * Fully transparent sprite at the exact size of a tap zone. Sized per zone
 * rather than stretched, so the hit area is the whole tile no matter how the
 * runtime scales images.
 */
const hitName = (w, h) => `hit/${w}x${h}.png`

/**
 * Hit areas are fully transparent on purpose. IMG_CLICK paints its `src`
 * permanently, not only while held, so anything visible here would show up as
 * a box drawn over the tile.
 */
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
    text(w / 2, TEMP_GLYPH.h / 2, ch, { size: D.PILL.valueSize, color: T.C.primary, weight: 600 })
  )
}

// -------------------------------------------------------------- layers -----

function backgroundSvg() {
  return svgDoc(
    D.W,
    D.H,
    `<rect width="${D.W}" height="${D.H}" fill="${T.C.bg}"/>` +
      dialLayer(D.DIAL.cx, D.DIAL.cy) +
      tiles() +
      pillRow()
  )
}

function aodSvg() {
  const { cx, cy, rHour, rMin } = D.AOD
  let out = `<rect width="${D.W}" height="${D.H}" fill="${T.C.bg}"/>`

  for (let h = 0; h < 24; h += 1) {
    const p = D.polar(cx, cy, rHour, h * 15)
    const quarter = h % 6 === 0
    out +=
      `<circle cx="${round(p.x)}" cy="${round(p.y)}" ` +
      `r="${quarter ? D.AOD.quarterDotR : D.AOD.hourDotR}" ` +
      `fill="${quarter ? T.C.aodDim : T.C.aodFaint}"/>`
  }

  for (let m = 0; m < 60; m += 5) {
    const p = D.polar(cx, cy, rMin, m * 6)
    out += `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${D.AOD.minDotR}" fill="${T.C.aodFaint}"/>`
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
      color: T.C[slot.value.color],
      weight: 700,
      anchor: 'start',
    })

    if (slot.unit) {
      out += text(box.x + slot.unit.dx, D.tileValueY(box) + 6, slot.unit.text || sample[slot.key + 'Unit'], {
        size: slot.unit.size,
        color: T.C[slot.unit.color],
        weight: 600,
        anchor: 'start',
      })
    }

    if (slot.meter) {
      const m = slot.meter
      const pct =
        m.name === 'hr'
          ? Math.max(0, Math.min(1, (Number(value) - 50) / 130))
          : Number(value) / 100
      const parts = meterParts(m.name, pct, 'plit')
      defs += parts.defs
      out += `<g transform="translate(${box.x + m.dx} ${box.y + m.dy})">${parts.body}</g>`
    }
  }

  D.PILL.cells.forEach((cell, i) => {
    out += text(D.cellCenter(i), D.PILL.y + D.PILL.h - D.TILE.valueDy, sample[cell.key], {
      size: D.PILL.valueSize,
      color: T.C.primary,
      weight: 700,
    })
  })

  const ring = (p, r, label, size) =>
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r + 4}" fill="${T.C.marker}" opacity="0.13"/>` +
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" fill="${T.C.markerFill}"/>` +
    `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${r}" fill="none" stroke="${T.C.marker}" stroke-width="2.5"/>` +
    text(p.x, p.y, label, {
      size,
      color: T.C.primary,
      weight: 400,
      family: D.DIAL.markerFont,
      baseline: D.DIAL.markerBaseline,
      stroke: D.DIAL.markerStroke,
    })

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
      color: slot.value.color, // role name — the runtime resolves it per theme
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
    meter: slot.meter
      ? {
          name: slot.meter.name,
          x: slot.box.x + slot.meter.dx,
          y: slot.box.y + slot.meter.dy,
          w: slot.meter.w,
          h: slot.meter.h,
        }
      : null,
    dataType: slot.dataType || null,
  }))

  const pillCells = D.PILL.cells.map((cell, i) => ({
    key: cell.key,
    app: cell.app,
    dataType: cell.dataType || null,
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

/**
 * One entry per theme. Its color map is keyed by role, so a slot that asks
 * for 'primary' gets whatever this theme calls primary.
 */
export const THEMES = ${jsonWithColors(
    D.THEMES.map((t) => ({ id: t.id, key: t.key, name: t.name, color: t.C }))
  )}

const pad = (n) => (n < 10 ? '0' + n : '' + n)

/**
 * Theme-scoped paths take the theme key; the rest are shared.
 *
 * The two the editor consumes live flat at the assets root rather than inside
 * the theme folder — that is how the stock faces name them
 * (background_theme1.png), and WATCHFACE_EDIT_BG drew nothing when they were
 * given as a subfolder path.
 */
export const IMAGE = {
  bg: (t) => 'bg_' + t + '.png',
  preview: (t) => 'preview_' + t + '.png',
  hourHighlight: (t, h) => t + '/hl/h' + pad(h) + '.png',
  minuteHighlight: (t, m) => t + '/hl/m' + pad(m) + '.png',
  meter: (t, name, step) => t + '/meter/' + name + '/' + pad(step) + '.png',
  tempGlyph: (t, ch) => t + '/temp/' + ch + '.png',
  aod: 'aod.png',
  aodHourRing: 'hl/aod_h.png',
  aodMinuteRing: 'hl/aod_m.png',
  editorFg: 'edit_fg.png',
  editorTips: 'edit_tips.png',
}

export const TEMP_FONT = (t) =>
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => IMAGE.tempGlyph(t, d))
export const TEMP_DEGREE = (t) => IMAGE.tempGlyph(t, 'deg')
export const TEMP_NEGATIVE = (t) => IMAGE.tempGlyph(t, 'neg')
export const TEMP_INVALID = (t) => IMAGE.tempGlyph(t, 'dash')

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

export const METER_STEPS = ${D.METER_STEPS}

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

/**
 * Confirms the marker digits still clear their ring.
 *
 * Renders the two-digit pair that reaches furthest from the centre and
 * measures it, so raising markerFontRatio cannot silently push the numbers
 * into the ring.
 */
function checkMarkerFit(radius, font, label) {
  const canvas = 260
  const c = canvas / 2
  const png = PNG.sync.read(
    new Resvg(
      svgDoc(
        canvas,
        canvas,
        text(c, c, '04', {
          size: font,
          color: '#ffffff',
          weight: 400,
          family: D.DIAL.markerFont,
          baseline: D.DIAL.markerBaseline,
          stroke: D.DIAL.markerStroke,
        })
      ),
      { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: FAMILY } }
    )
      .render()
      .asPng()
  )

  let reach = 0
  for (let y = 0; y < canvas; y += 1) {
    for (let x = 0; x < canvas; x += 1) {
      if (png.data[((y * canvas + x) << 2) + 3] > 60) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
        if (d > reach) reach = d
      }
    }
  }

  const usable = radius - 1.25 // half the ring's stroke
  if (reach > usable) {
    throw new Error(
      `${label} digits at size ${font} reach ${reach.toFixed(1)}px, past the ring at ${usable.toFixed(2)}px`
    )
  }
  return usable - reach
}

// ----------------------------------------------------------------- main ----

/** The readings drawn into every theme's preview image. */
const SAMPLE = {
  hr: '87',
  distance: '3.50',
  steps: '4505',
  date: 'TUE 30',
  battery: '65',
  temp: '23\u00b0',
  kcal: '450',
  stress: '56',
  pai: '23',
  hour: 14,
  minute: 20,
}

function main() {
  const themeCount = D.checkThemes()
  const gap = D.checkGeometry()
  const hourFit = checkMarkerFit(D.DIAL.hlHourR, D.DIAL.hlHourFont, 'hour')
  const minFit = checkMarkerFit(D.DIAL.hlMinR, D.DIAL.hlMinFont, 'minute')
  console.log(`  ${themeCount} themes: ` + D.THEMES.map((t) => t.name).join(', '))
  console.log(
    `  marker clearance ${gap}px; digits clear the ring by ` +
    `${hourFit.toFixed(1)}px (hour, size ${D.DIAL.hlHourFont}) and ` +
    `${minFit.toFixed(1)}px (minute, size ${D.DIAL.hlMinFont})`
  )
  if (FONT_FILES.length === 0) {
    console.warn('! Segoe UI not found in ' + FONT_DIR + ', falling back to system font matching')
  }
  mkdirp(OUT)

  // shared, colour-independent
  render(aodSvg(), 'aod.png')
  render(editorChromeSvg(D.W, D.H), 'edit_fg.png')
  render(editorChromeSvg(120, 40), 'edit_tips.png')
  render(aodRingSprite(D.DIAL.hlHourBox, D.DIAL.hlHourR), 'hl/aod_h.png')
  render(aodRingSprite(D.DIAL.hlMinBox, D.DIAL.hlMinR), 'hl/aod_m.png')

  const hitSizes = new Set()
  D.SLOTS.forEach((s) => hitSizes.add(s.box.w + 'x' + s.box.h))
  hitSizes.add(Math.round(D.cellW) + 'x' + D.PILL.h)
  hitSizes.forEach((size) => {
    const [w, h] = size.split('x').map(Number)
    render(hitSprite(w, h), hitName(w, h))
  })

  // one folder per theme
  for (const theme of D.THEMES) {
    T = theme
    const dir = theme.key + '/'

    render(backgroundSvg(), 'bg_' + theme.key + '.png')

    for (let h = 0; h < 24; h += 1) {
      render(
        highlightSprite(D.DIAL.hlHourBox, D.DIAL.hlHourR, D.pad2(h), D.DIAL.hlHourFont),
        dir + `hl/h${D.pad2(h)}.png`
      )
    }
    for (let m = 0; m < 60; m += 1) {
      render(
        highlightSprite(D.DIAL.hlMinBox, D.DIAL.hlMinR, D.pad2(m), D.DIAL.hlMinFont),
        dir + `hl/m${D.pad2(m)}.png`
      )
    }

    for (const slot of D.SLOTS) {
      if (!slot.meter) continue
      for (let i = 0; i < D.METER_STEPS; i += 1) {
        render(meterFrame(slot.meter.name, i / (D.METER_STEPS - 1)), dir + `meter/${slot.meter.name}/${D.pad2(i)}.png`)
      }
    }

    for (let d = 0; d < 10; d += 1) render(tempGlyph(String(d)), dir + `temp/${d}.png`)
    render(tempGlyph('\u00b0', 12), dir + 'temp/deg.png')
    render(tempGlyph('-', 12), dir + 'temp/neg.png')
    render(tempGlyph('\u2013', 17), dir + 'temp/dash.png')

    const preview = previewSvg(SAMPLE)
    render(preview, 'preview_' + theme.key + '.png')
    // the watchface list thumbnail comes from the first theme
    if (theme.id === 1) render(preview, 'icon.png')
  }
  T = D.THEMES[0]

  emitLayout()
  console.log(`✓ ${written} PNGs written to assets/default`)
  console.log('✓ watchface/layout.js regenerated')
}

main()
