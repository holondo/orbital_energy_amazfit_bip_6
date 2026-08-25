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
// Values sampled from reference/target-mockup.png (see tools/sample-colors.js).
const C = {
  bg: '#000000',
  pink: '#f24bcf',
  pinkDim: '#8a2c76',
  magenta: '#ee4cc4',
  cyan: '#0be0f2',
  cyanDim: '#0d4c56',
  blue: '#7175ff',
  sky: '#55b1ff',
  violet: '#8483f5',
  white: '#ffffff',
  label: '#efecf7',
  divider: '#241f3a',
  chip: '#0b0a16',
  pillBg: '#0c0c3f',
  pillEdge: '#1d1e6b',
  pillDiv: '#383993',
  barTrack: '#18165f',
  aodDim: '#5a5a6e',
  aodFaint: '#33333f',
  aodText: '#c8c8d8',
}

// ------------------------------------------------------------------ dial ---
const DIAL = {
  cx: 256,
  cy: 186,
  rHour: 102, // radius of the 24 hour markers
  rMin: 68, // radius of the 60 minute markers
  hourChipR: 13.5, // faint disc behind each hour number
  hourFont: 14,
  minFont: 11,
  minDotR: 2.4,
  // rHour - rMin === hlHourR + hlMinR, so the two highlight chips meet without
  // ever overlapping — including at 00:00, when they point the same way.
  hlHourR: 20, // highlight ring radius, hours
  hlMinR: 14, // highlight ring radius, minutes
  hlHourBox: 48, // highlight sprite size (ring + glow)
  hlMinBox: 36,
  hlHourFont: 23,
  hlMinFont: 16,
}

// ---------------------------------------------------------- left column ----
const COL = {
  x: 13,
  w: 118,
  rowH: 52,
  row0Y: 34,
  iconSize: 19,
  labelX: 38,
  labelSize: 15,
  valueSize: 27,
  unitSize: 15,
}

const ROWS = [
  { key: 'hr', icon: 'heart', color: C.pink, label: null },
  { key: 'distance', icon: 'pin', color: C.blue, label: 'Distance' },
  { key: 'steps', icon: 'steps', color: C.sky, label: 'Steps' },
  { key: 'date', icon: 'calendar', color: C.violet, label: 'Date' },
  { key: 'stand', icon: 'stand', color: C.cyan, label: 'Stand' },
]

const rowY = (i) => COL.row0Y + i * COL.rowH

// heart-rate mini bar that replaces the label on row 0
const HR_BAR = { x: COL.labelX, w: 68, h: 13, dy: 3 }

// Boxes for the live values and their trailing units, left-aligned inside the
// column. Widths are sized for the largest plausible reading.
const VALUE_BOX = {
  hr: { x: COL.x, w: 52 },
  distance: { x: COL.x, w: 70 },
  steps: { x: COL.x, w: COL.w },
  date: { x: COL.x, w: COL.w },
  stand: { x: COL.x, w: 40 },
}

const UNIT_BOX = {
  hr: { x: COL.x + 53, w: 62, size: COL.unitSize },
  distance: { x: COL.x + 71, w: 46, size: COL.unitSize },
  stand: { x: COL.x + 41, w: 70, size: 21 },
}

// ------------------------------------------------------------- battery -----
const BAT = {
  y: 300,
  iconSize: 20,
  valueX: 38,
  valueW: 54,
  valueSize: 26,
  waveX: 94,
  waveY: 298,
  waveW: 118,
  waveH: 34,
  waveSteps: 21, // 0%, 5% … 100%
}

// ---------------------------------------------------------------- pill -----
const PILL = {
  x: 16,
  y: 362,
  w: 358,
  h: 66,
  r: 33,
  cells: ['Temp', 'Kcal', 'Stress', 'PAI'],
  labelY: 372,
  labelH: 20,
  labelSize: 14,
  valueY: 392,
  valueH: 30,
  valueSize: 25,
  divTop: 378,
  divBottom: 414,
}

const cellW = PILL.w / PILL.cells.length
const cellCenter = (i) => Math.round(PILL.x + cellW * (i + 0.5))
const cellDivider = (i) => Math.round(PILL.x + cellW * (i + 1)) // i = 0..2

// --------------------------------------------------------------- AOD -------
// The AOD layer keeps only the orbital dial, with the digital time inside the
// minute ring — few lit pixels, still readable at a glance.
const AOD = {
  // Centred on the screen rather than inheriting the dial's off-centre
  // position, since the stats column is not drawn in this state.
  cx: 195,
  cy: 205,
  hourDotR: 3,
  quarterDotR: 4.2,
  minDotR: 1.6,
  x: 85,
  w: 220,
  timeY: 167,
  timeH: 50,
  timeSize: 40,
  dateY: 221,
  dateH: 22,
  dateSize: 18,
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
  if (minute === 0) return '#cfc8dc'
  return hsl(ringHue(minute * 6), 36, 66)
}

function minuteDotColor(minute) {
  return hsl(ringHue(minute * 6), 42, 50)
}

const pad2 = (n) => (n < 10 ? '0' + n : String(n))

// --------------------------------------------------------------- icons -----
// 24 x 24 viewBox. `fill` shapes are emitted with the row colour.
const ICONS = {
  heart:
    '<path d="M12 21.2c-.4 0-.8-.2-1.1-.4C6.1 17 2.4 13.6 2.4 9.6c0-3 2.3-5.2 5.1-5.2 1.8 0 3.4.9 4.5 2.4 1.1-1.5 2.7-2.4 4.5-2.4 2.8 0 5.1 2.2 5.1 5.2 0 4-3.7 7.4-8.5 11.2-.3.2-.7.4-1.1.4z"/>',
  pin:
    '<path d="M12 1.8c-3.9 0-7 3.1-7 7 0 5.1 6 12.3 6.3 12.6.2.2.5.2.7 0 .3-.3 7-7.5 7-12.6 0-3.9-3.1-7-7-7zm0 9.7a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z"/>',
  // one bold footprint reads far better than a pair at 19 px
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
  COL,
  ROWS,
  HR_BAR,
  VALUE_BOX,
  UNIT_BOX,
  BAT,
  PILL,
  AOD,
  ICONS,
  rowY,
  cellW,
  cellCenter,
  cellDivider,
  polar,
  hsl,
  ringHue,
  hourColor,
  minuteLabelColor,
  minuteDotColor,
  pad2,
}
