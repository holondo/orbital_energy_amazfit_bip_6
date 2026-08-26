/**
 * Orbit Energy — single source of truth for the watchface design.
 *
 * Both the asset generator (build-assets.cjs) and the runtime layout module
 * (watchface/layout.js, generated) read from here, so the PNG background and
 * the live widgets can never drift apart.
 *
 * Coordinate system: Amazfit Bip 6, 390 x 450 logical pixels.
 * Ring angles are measured in degrees from 12 o'clock, growing clockwise.
 */

const W = 390
const H = 450

// ---------------------------------------------------------------- palette --
//
// Colours are referenced by ROLE, never by hue: a slot asks for `primary`, and
// the active theme decides whether that is magenta or tan. Every theme must
// define every role.
//
// Theme 1 (aurora) is the original palette, sampled from
// reference/target-mockup.png. The rest are drawn from the stock Expressive
// Energy themes, which all follow one pattern: a dominant hue for the
// readings, a deliberately *contrasting* accent for the battery, and a dark
// surface tinted towards the dominant hue.
const ROLES = [
  'bg',
  'primary', // the readings
  'marker', // the orbital marker rings
  'markerFill', // the marker's dark interior
  'accent', // battery — a contrasting hue on purpose
  'accentDim', // the unlit part of the battery wave
  'iconDistance',
  'iconSteps',
  'iconDate',
  'white',
  'label',
  'chip', // the disc behind each ring number
  'tileBg',
  'tileEdge',
  'pillBg',
  'pillEdge',
  'pillDiv',
  'barTrack',
  'aodDim',
  'aodFaint',
  'aodText',
]

/**
 * The hour and minute rings are not literal colour lists — they sweep hue with
 * position, so each theme supplies the sweep rather than 36 hard-coded values.
 * `hue` is the centre, `spread` how far it swings across the dial, and `zero`
 * the single marker (00) called out brighter than the rest.
 */
const THEMES = [
  {
    id: 1,
    key: 't1',
    name: 'Aurora',
    ring: { hue: 250, spread: 45, sat: 62, light: 68, lightQuarter: 78, zero: '#f6ecfa' },
    minRing: { sat: 38, light: 66, zero: '#d6cfe2' },
    C: {
      bg: '#000000',
      primary: '#f24bcf',
      marker: '#ee4cc4',
      markerFill: '#16091a',
      accent: '#0be0f2',
      accentDim: '#0d4c56',
      iconDistance: '#7175ff',
      iconSteps: '#55b1ff',
      iconDate: '#8483f5',
      white: '#ffffff',
      label: '#efecf7',
      chip: '#0d0c1c',
      tileBg: '#0a0a2c',
      tileEdge: '#1c1c58',
      pillBg: '#0c0c3f',
      pillEdge: '#22236f',
      pillDiv: '#383993',
      barTrack: '#1b1966',
      aodDim: '#5a5a6e',
      aodFaint: '#33333f',
      aodText: '#c8c8d8',
    },
  },
  {
    id: 2,
    key: 't2',
    name: 'Sand',
    ring: { hue: 30, spread: 14, sat: 40, light: 70, lightQuarter: 80, zero: '#fbe8d5' },
    minRing: { sat: 26, light: 62, zero: '#e0c8ae' },
    C: {
      bg: '#000000',
      primary: '#d2a483',
      marker: '#c98f63',
      markerFill: '#1c120a',
      accent: '#32bfcb',
      accentDim: '#0f3a3e',
      iconDistance: '#c3a184',
      iconSteps: '#e0bb96',
      iconDate: '#b08a6d',
      white: '#fff6ec',
      label: '#fad9c1',
      chip: '#191310',
      tileBg: '#241a15',
      tileEdge: '#4a382c',
      pillBg: '#382d2c',
      pillEdge: '#5c4740',
      pillDiv: '#7d6154',
      barTrack: '#4a382c',
      aodDim: '#5a5a6e',
      aodFaint: '#33333f',
      aodText: '#c8c8d8',
    },
  },
  {
    id: 3,
    key: 't3',
    name: 'Graphite',
    ring: { hue: 220, spread: 10, sat: 6, light: 72, lightQuarter: 84, zero: '#ffffff' },
    minRing: { sat: 4, light: 62, zero: '#d4d4d6' },
    C: {
      bg: '#000000',
      primary: '#e8e8ea',
      marker: '#c8c8cc',
      markerFill: '#17171a',
      accent: '#54bb54',
      accentDim: '#173a17',
      iconDistance: '#a9a8a8',
      iconSteps: '#c9c9cb',
      iconDate: '#8f8f92',
      white: '#ffffff',
      label: '#f6f8f8',
      chip: '#151516',
      tileBg: '#1c1c1e',
      tileEdge: '#3a3a3d',
      pillBg: '#353535',
      pillEdge: '#555558',
      pillDiv: '#77777a',
      barTrack: '#3a3a3d',
      aodDim: '#5a5a6e',
      aodFaint: '#33333f',
      aodText: '#c8c8d8',
    },
  },
  {
    id: 4,
    key: 't4',
    name: 'Blossom',
    ring: { hue: 330, spread: 30, sat: 50, light: 70, lightQuarter: 80, zero: '#ffd9e6' },
    minRing: { sat: 32, light: 64, zero: '#e8b8ce' },
    C: {
      bg: '#000000',
      primary: '#ef558a',
      marker: '#e8467f',
      markerFill: '#1e0a16',
      accent: '#41dbac',
      accentDim: '#123b30',
      iconDistance: '#c86ab8',
      iconSteps: '#ef8bb0',
      iconDate: '#b45fa0',
      white: '#ffffff',
      label: '#f5c5d7',
      chip: '#1a0f18',
      tileBg: '#2a1130',
      tileEdge: '#54265f',
      pillBg: '#431c55',
      pillEdge: '#6b3080',
      pillDiv: '#8f4aa8',
      barTrack: '#54265f',
      aodDim: '#5a5a6e',
      aodFaint: '#33333f',
      aodText: '#c8c8d8',
    },
  },
]

/** Fails loudly rather than letting a theme quietly miss or invent a role. */
function checkThemes() {
  for (const t of THEMES) {
    for (const role of ROLES) {
      if (!t.C[role]) {
        throw new Error('theme ' + t.key + ' (' + t.name + ") is missing the '" + role + "' colour")
      }
    }
    for (const extra of Object.keys(t.C)) {
      if (ROLES.indexOf(extra) === -1) {
        throw new Error('theme ' + t.key + " defines unknown role '" + extra + "'")
      }
    }
  }
  return THEMES.length
}

const themeByKey = (key) => THEMES.filter((t) => t.key === key)[0] || THEMES[0]

// ------------------------------------------------------------------ dial ---
//
// Anchored to the top-right corner. Both markers grow *inwards* from their
// ring towards the empty centre, so they read large without pushing the dial
// off-screen. The invariant below keeps them from ever touching:
//
//   hour marker spans   [rHour + hourOverhang - 2*hlHourR, rHour + hourOverhang]
//   minute marker spans [rMin  + minOverhang  - 2*hlMinR,  rMin  + minOverhang]
//
// so the hour marker's inner edge must clear the minute marker's outer edge.
// checkGeometry() below enforces it at asset-build time.
const DIAL = {
  cx: 252,
  cy: 140,
  rHour: 119, // radius of the 24 hour markers
  rMin: 43, // radius of the 12 minute markers
  hourChipR: 13.5, // faint disc behind each hour number
  minChipR: 11,
  hourFont: 16,
  minFont: 12,

  // The dial's footprint is a disc of radius rHour + hourOverhang, so it can sit
  // tangent to the top and right edges however round the display corners are:
  // eroding a rounded rect by a radius at least as large as the corner radius
  // leaves a plain rectangle. Only the tiles at x<=112 and the middle row at
  // y=280 actually constrain it, and the horizontal side binds first at 136.
  hourOverhang: 17, // how far past the hour ring the marker reaches
  minOverhang: 13,
  hlHourR: 40,
  hlMinR: 28,
  hlHourBox: 84, // sprite size (marker + glow)
  hlMinBox: 60,
  // The marker digits are set in Instrument Serif, vendored in tools/fonts/.
  // Only the generator needs it: the markers ship as PNG sprites, so the watch
  // never has to resolve the font.
  //
  // It is much narrower than the UI face — the widest two-digit pair measures
  // 0.86 em against Segoe's 1.12 — so the same circle takes a far larger size.
  //
  // It has no bold weight, and untouched it is too fine for this display: only
  // 9% of its ink survives a 2px erosion, against 55% for Segoe UI Bold. The
  // stroke below thickens the letterforms to 38%, which lands between Segoe's
  // Semibold and Bold while keeping the serif, and costs one point of size.
  //
  // Measured across all 100 two-digit pairs, "04" reaches furthest; at 0.8125
  // with this stroke it clears the ring by 1.9px. checkMarkerFit() re-tests it
  // on every build.
  markerFont: 'Instrument Serif',
  markerBaseline: 0.365, // em above the baseline to the optical centre
  markerStroke: 2.4, // drawn under the fill, so it thickens outwards
  markerFontRatio: 0.8125,
  //
  // A flat disc with the number overflowing it — no ring — was tried and
  // reverted: without an outline the two markers read as one four-digit number
  // whenever they align, as at 06:15.
}

/**
 * Sanity bound on the moving sprites — a tripwire, not a hardware limit.
 *
 * A 56x56 marker once came back from the device drawn as only its top-left
 * 48x48 while the 52x52 one beside it was perfect, which looked like a size
 * cap. It was not: bg.png is 390x450 and never truncates. The two markers
 * differed in *when* they were last updated — the hour had changed at 14:00
 * with the screen off, the minute 17 seconds before the capture with it on.
 * Updates that land while the screen is off do not render, which is the same
 * fault that made the minute appear to freeze. WIDGET_DELEGATE's resume_call
 * now redraws everything on wake, so the size is free again.
 */
const MAX_SPRITE = 88

DIAL.hlHourCentre = DIAL.rHour + DIAL.hourOverhang - DIAL.hlHourR
DIAL.hlMinCentre = DIAL.rMin + DIAL.minOverhang - DIAL.hlMinR
// floor, not round: the size is bounded by how much fits inside the ring, so
// the conservative direction is the correct one.
DIAL.hlHourFont = Math.floor(2 * DIAL.hlHourR * DIAL.markerFontRatio)
DIAL.hlMinFont = Math.floor(2 * DIAL.hlMinR * DIAL.markerFontRatio)

// ---------------------------------------------------------------- tiles ----
const TILE = {
  r: 18,
  pad: 9,
  iconSize: 20,
  labelDx: 32,
  labelSize: 14,
  labelDy: 20, // centre line of the icon + label row
  valueDy: 24, // distance from the tile's bottom edge to the value centre
}

const tileLabelY = (box) => box.y + TILE.labelDy
const tileValueY = (box) => box.y + box.h - TILE.valueDy

/**
 * Every metric cell on the face: where it sits, how it is drawn, and which
 * system app a tap on it opens. Tap targets are the whole tile.
 */
const SLOTS = [
  {
    key: 'hr',
    box: { x: 12, y: 28, w: 100, h: 78 },
    icon: 'heart',
    iconColor: 'primary',
    meter: { name: 'hr', dx: 32, dy: 11, w: 59, h: 14 }, // zone bar, replaces the label
    value: { size: 28, color: 'primary', w: 50 },
    unit: { text: 'BPM', color: 'white', size: 13, dx: 60, w: 38 },
    dataType: 'HEART',
    app: 'HR',
  },
  {
    key: 'distance',
    box: { x: 12, y: 112, w: 100, h: 78 },
    icon: 'pin',
    iconColor: 'iconDistance',
    label: 'Distance',
    value: { size: 28, color: 'primary', w: 57 },
    unit: { text: 'KM', color: 'iconDistance', size: 13, dx: 67, w: 32 },
    dataType: 'DISTANCE',
    app: 'STATUS',
  },
  {
    key: 'steps',
    box: { x: 12, y: 196, w: 100, h: 78 },
    icon: 'steps',
    iconColor: 'iconSteps',
    label: 'Steps',
    value: { size: 28, color: 'primary', w: 82 },
    dataType: 'STEP',
    app: 'STATUS',
  },
  {
    key: 'date',
    // squared off with the column above it, which hands the width to the battery
    box: { x: 12, y: 280, w: 100, h: 68 },
    icon: 'calendar',
    iconColor: 'iconDate',
    label: 'Date',
    // 'WED 26' measures 82px on the device at size 24 — exactly the content
    // width, which is what set the marquee off. One size down plus a box that
    // runs past the nominal padding gives it real slack.
    value: { size: 23, color: 'primary', w: 88 },
    app: 'CALENDAR',
  },
  {
    key: 'battery',
    box: { x: 118, y: 280, w: 262, h: 68 },
    icon: 'bolt',
    iconColor: 'accent',
    label: 'Battery',
    meter: { name: 'battery', dx: 62, dy: 31, w: 191, h: 26 }, // sits beside the reading
    value: { size: 28, color: 'accent', w: 50 },
    dataType: 'BATTERY',
    app: 'SETTING',
  },
]

/** Fails the asset build rather than shipping a dial that overlaps itself. */
function checkGeometry() {
  const gap =
    DIAL.rHour + DIAL.hourOverhang - 2 * DIAL.hlHourR - (DIAL.rMin + DIAL.minOverhang)
  if (gap < 0) {
    throw new Error(`hour and minute markers overlap by ${-gap}px — shrink hlHourR or spread the rings`)
  }
  for (const [name, box] of [['hlHourBox', DIAL.hlHourBox], ['hlMinBox', DIAL.hlMinBox]]) {
    if (box > MAX_SPRITE) {
      throw new Error(`${name} is ${box}px; the watch truncates moving sprites above ${MAX_SPRITE}px`)
    }
  }
  if (2 * (DIAL.hlHourR + 2) > DIAL.hlHourBox || 2 * (DIAL.hlMinR + 2) > DIAL.hlMinBox) {
    throw new Error('a marker plus its glow does not fit inside its sprite box')
  }
  return gap
}

/**
 * Both meters are image strips swapped by level rather than resized widgets:
 * a partial setProperty(MORE, ...) patch does not reliably resize a live
 * widget on this firmware, but swapping `src` does.
 */
const METER_STEPS = 21 // 0%, 5% … 100%

// ---------------------------------------------------------------- pill -----
const PILL = {
  x: 12,
  y: 356,
  w: 368,
  h: 68,
  r: 34,
  labelSize: 15,
  valueSize: 28,
  divInset: 16,
  cells: [
    { key: 'temp', label: 'Temp', dataType: 'WEATHER_CURRENT', app: 'WEATHER' },
    { key: 'kcal', label: 'Kcal', dataType: 'CAL', app: 'STATUS' },
    { key: 'stress', label: 'Stress', dataType: 'STRESS', app: 'PRESSURE' },
    { key: 'pai', label: 'PAI', dataType: 'PAI_DAILY', app: 'PAI' },
  ],
}

const cellW = PILL.w / PILL.cells.length
const cellCenter = (i) => Math.round(PILL.x + cellW * (i + 0.5))
const cellDivider = (i) => Math.round(PILL.x + cellW * (i + 1)) // i = 0..2

// --------------------------------------------------------------- AOD -------
// Centred on the screen rather than inheriting the dial's top-right position,
// since none of the tiles are drawn in this state.
const AOD = {
  cx: 195,
  cy: 210,
  // Roomier than the daytime dial — with the tiles gone there is space for it,
  // and the wider inner ring leaves the digital time an uncluttered middle.
  // The chips sit *on* their rings here instead of growing inwards.
  rHour: 150,
  rMin: 82,
  hourDotR: 3,
  quarterDotR: 4.2,
  minDotR: 2,
  x: 85,
  w: 220,
  timeY: 173,
  timeH: 46,
  timeSize: 34,
  dateY: 221,
  dateH: 22,
  dateSize: 17,
}

// ------------------------------------------------------------- helpers -----

/** Point on a circle, angle in degrees clockwise from 12 o'clock. */
function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r }
}

/** HSL to #rrggbb. resvg only accepts hex/rgb() notation, so convert here. */
function hsl(h, s, l) {
  const hh = ((h % 360) + 360) % 360
  const ss = s / 100
  const ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = ll - c / 2
  const seg = Math.floor(hh / 60) % 6
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg]
  return (
    '#' +
    rgb
      .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Hue sweep around the dial — one side of the ring runs cooler than the other.
 * The theme supplies the centre hue and how far it swings.
 */
function ringHue(theme, deg) {
  return theme.ring.hue - theme.ring.spread * Math.sin((deg * Math.PI) / 180)
}

function hourColor(theme, hour) {
  if (hour === 0) return theme.ring.zero
  const quarter = hour % 6 === 0
  return hsl(
    ringHue(theme, hour * 15),
    theme.ring.sat,
    quarter ? theme.ring.lightQuarter : theme.ring.light
  )
}

function minuteLabelColor(theme, minute) {
  if (minute === 0) return theme.minRing.zero
  return hsl(ringHue(theme, minute * 6), theme.minRing.sat, theme.minRing.light)
}

const pad2 = (n) => (n < 10 ? '0' + n : String(n))

// --------------------------------------------------------------- icons -----
// 24 x 24 viewBox. `fill` shapes are emitted with the slot colour.
const ICONS = {
  heart:
    '<path d="M12 21.2c-.4 0-.8-.2-1.1-.4C6.1 17 2.4 13.6 2.4 9.6c0-3 2.3-5.2 5.1-5.2 1.8 0 3.4.9 4.5 2.4 1.1-1.5 2.7-2.4 4.5-2.4 2.8 0 5.1 2.2 5.1 5.2 0 4-3.7 7.4-8.5 11.2-.3.2-.7.4-1.1.4z"/>',
  pin:
    '<path d="M12 1.8c-3.9 0-7 3.1-7 7 0 5.1 6 12.3 6.3 12.6.2.2.5.2.7 0 .3-.3 7-7.5 7-12.6 0-3.9-3.1-7-7-7zm0 9.7a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z"/>',
  // one bold footprint reads far better than a pair at 20 px
  steps:
    '<g><ellipse cx="11.2" cy="14.6" rx="5.1" ry="7.4" transform="rotate(-7 11.2 14.6)"/>' +
    '<circle cx="5.5" cy="5.6" r="2"/><circle cx="10.1" cy="3.6" r="2.3"/>' +
    '<circle cx="14.6" cy="4.6" r="1.9"/><circle cx="18.1" cy="7.2" r="1.5"/></g>',
  calendar:
    '<g><rect x="3" y="5" width="18" height="16" rx="3.4"/>' +
    '<rect x="6.6" y="1.8" width="2.4" height="4.6" rx="1.2"/>' +
    '<rect x="15" y="1.8" width="2.4" height="4.6" rx="1.2"/></g>',
  calendarHoles:
    '<g><circle cx="8" cy="12.4" r="1.35"/><circle cx="12" cy="12.4" r="1.35"/>' +
    '<circle cx="16" cy="12.4" r="1.35"/><circle cx="8" cy="16.6" r="1.35"/>' +
    '<circle cx="12" cy="16.6" r="1.35"/><circle cx="16" cy="16.6" r="1.35"/></g>',
  stand:
    '<g><circle cx="12" cy="3.4" r="2.5"/>' +
    '<path d="M12 6.6c-2.1 0-3.4 1-3.9 2.8L6.6 15c-.2.8.2 1.5 1 1.7.8.2 1.5-.2 1.7-1l.9-3.2v2.9l-1.7 5.7c-.2.9.2 1.6 1 1.8.9.2 1.6-.2 1.8-1l1.2-4.3h.1l1.2 4.3c.2.9 1 1.3 1.8 1 .9-.2 1.3-1 1-1.8l-1.7-5.7v-2.9l.9 3.2c.2.8 1 1.2 1.7 1 .8-.2 1.2-.9 1-1.7l-1.5-5.6c-.5-1.8-1.8-2.8-3.9-2.8z"/></g>',
  bolt: '<path d="M13.8 1.5 4.4 13.2c-.4.5 0 1.3.7 1.3h4.3l-1.5 8c-.1.8.9 1.3 1.4.6l9.4-11.7c.4-.5 0-1.3-.7-1.3h-4.3l1.5-8c.2-.8-.9-1.3-1.4-.6z"/>',
}

module.exports = {
  W,
  H,
  ROLES,
  THEMES,
  themeByKey,
  checkThemes,
  DIAL,
  TILE,
  SLOTS,
  METER_STEPS,
  PILL,
  AOD,
  ICONS,
  MAX_SPRITE,
  checkGeometry,
  tileLabelY,
  tileValueY,
  cellW,
  cellCenter,
  cellDivider,
  polar,
  hsl,
  ringHue,
  hourColor,
  minuteLabelColor,
  pad2,
}
