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
// Values sampled from reference/target-mockup.png (see tools/sample-colors.cjs).
const C = {
  bg: '#000000',
  pink: '#f24bcf',
  magenta: '#ee4cc4',
  cyan: '#0be0f2',
  cyanDim: '#0d4c56',
  blue: '#7175ff',
  sky: '#55b1ff',
  violet: '#8483f5',
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
}

// ------------------------------------------------------------------ dial ---
//
// Anchored to the top-right corner. Both highlight chips grow *inwards* from
// their ring towards the empty centre, so they read large without pushing the
// dial off-screen. The invariant below keeps them from ever touching:
//
//   hour chip spans   [rHour + hourOverhang - 2*hlHourR, rHour + hourOverhang]
//   minute chip spans [rMin + minOverhang - 2*hlMinR,    rMin  + minOverhang]
//
// so the hour chip's inner edge must clear the minute chip's outer edge.
const DIAL = {
  cx: 258,
  cy: 148,
  rHour: 107, // radius of the 24 hour markers
  rMin: 58, // radius of the 12 minute markers
  hourChipR: 13.5, // faint disc behind each hour number
  minChipR: 11.5,
  hourFont: 16,
  minFont: 13,

  hourOverhang: 16, // how far past the hour ring the chip reaches
  minOverhang: 13,
  hlHourR: 25,
  hlMinR: 23,
  hlHourBox: 56, // sprite size (chip + glow)
  hlMinBox: 52,
  hlHourFont: 29,
  hlMinFont: 27,
}

DIAL.hlHourCentre = DIAL.rHour + DIAL.hourOverhang - DIAL.hlHourR
DIAL.hlMinCentre = DIAL.rMin + DIAL.minOverhang - DIAL.hlMinR

// ---------------------------------------------------------------- tiles ----
const TILE = {
  r: 18,
  pad: 12,
  iconSize: 20,
  labelDx: 38,
  labelSize: 15,
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
    box: { x: 12, y: 28, w: 120, h: 78 },
    icon: 'heart',
    iconColor: C.pink,
    gauge: { dx: 40, dy: 11, w: 66, h: 14 }, // heart-rate zone bar, replaces the label
    value: { size: 31, color: C.pink, w: 54 },
    unit: { text: 'BPM', color: C.white, size: 15, dx: 66, w: 48 },
    app: 'HR',
  },
  {
    key: 'distance',
    box: { x: 12, y: 112, w: 120, h: 78 },
    icon: 'pin',
    iconColor: C.blue,
    label: 'Distance',
    value: { size: 31, color: C.pink, w: 64 },
    unit: { text: 'KM', color: C.blue, size: 15, dx: 76, w: 36 },
    app: 'STATUS',
  },
  {
    key: 'steps',
    box: { x: 12, y: 196, w: 120, h: 78 },
    icon: 'steps',
    iconColor: C.sky,
    label: 'Steps',
    value: { size: 31, color: C.pink, w: 96 },
    app: 'STATUS',
  },
  {
    key: 'date',
    box: { x: 12, y: 280, w: 118, h: 68 },
    icon: 'calendar',
    iconColor: C.violet,
    label: 'Date',
    value: { size: 27, color: C.pink, w: 94 },
    app: 'CALENDAR',
  },
  {
    key: 'stand',
    box: { x: 136, y: 280, w: 100, h: 68 },
    icon: 'stand',
    iconColor: C.cyan,
    label: 'Stand',
    value: { size: 29, color: C.pink, w: 38 },
    unit: { color: C.cyan, size: 21, dx: 46, w: 46 }, // text comes from the goal
    app: 'STATUS',
  },
  {
    key: 'battery',
    box: { x: 242, y: 280, w: 138, h: 68 },
    icon: 'bolt',
    iconColor: C.cyan,
    wave: { dx: 40, dy: 7, w: 86, h: 26 }, // battery wave, replaces the label
    value: { size: 29, color: C.cyan, w: 60 },
    app: 'SETTING',
  },
]

const BAT = { waveSteps: 21 } // 0%, 5% … 100%

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
    { key: 'temp', label: 'Temp', app: 'WEATHER' },
    { key: 'kcal', label: 'Kcal', app: 'STATUS' },
    { key: 'stress', label: 'Stress', app: 'PRESSURE' },
    { key: 'pai', label: 'PAI', app: 'PAI' },
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
  rHour: 132,
  rMin: 84,
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
 * Hue sweep around the dial: blue on the right half, magenta on the left,
 * matching the gradient in the reference mockup.
 */
function ringHue(deg) {
  return 250 - 45 * Math.sin((deg * Math.PI) / 180)
}

function hourColor(hour) {
  if (hour === 0) return '#f6ecfa'
  const deg = hour * 15
  const quarter = hour % 6 === 0
  return hsl(ringHue(deg), 62, quarter ? 78 : 68)
}

function minuteLabelColor(minute) {
  if (minute === 0) return '#d6cfe2'
  return hsl(ringHue(minute * 6), 38, 66)
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
  C,
  DIAL,
  TILE,
  SLOTS,
  BAT,
  PILL,
  AOD,
  ICONS,
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
