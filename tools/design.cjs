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

/**
 * The display's physical corner radius.
 *
 * Nothing on a development machine reports this. `getDeviceInfo()` has no
 * radius field; `getAppWidgetSize()` does but lives on the `hmUI` global this
 * firmware does not have; and the simulator draws the screen as a plain
 * rectangle, so its own resources do not encode it either. It is therefore a
 * measured-by-eye tunable.
 *
 * Err large rather than small. Over-rounding leaves a hairline of background
 * between the card and the screen edge, which is invisible on an AMOLED that
 * is already black there. Under-rounding clips the corner off the card.
 */
const SCREEN_R = 56

/**
 * The one knob. Everything else on the face is derived from it.
 *
 * The dial's footprint is a disc, and everything that is not the dial lives in
 * an L — a column down the left edge, bars across the bottom. The largest disc
 * that fits the rectangle the L leaves has radius
 *
 *   R = min(W - COL_W, BAR_TOP) / 2
 *
 * so the column width and the bar height are set from R rather than chosen,
 * which keeps either from wasting room the other could have used.
 *
 * Raising R costs column width at 2px for every 1px of radius, so what the
 * column is asked to hold decides how big the dial can be. The column's width
 * is set by its widest reading, and the bars below have 390px to spend for
 * free — so every reading wider than three digits belongs in a bar, not the
 * column. Keeping "4505" and "THU 27" in the column capped R at 148 and forced
 * the readings down to 25pt; moving them out reaches 164 with the readings back
 * at full size.
 */
const DIAL_R = 164

/** Transparent padding around a marker circle, for its glow. */
const MARKER_GLOW = 2

const COL_W = W - 2 * DIAL_R // left column width
const BAR_TOP = 2 * DIAL_R // first pixel row belonging to the bottom bars
const GAP = 8 // between cards, everywhere

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
  // Tangent to the top and right edges, and to the L on the other two sides.
  cx: W - DIAL_R,
  cy: DIAL_R,
  rHour: 144, // radius of the 24 hour markers
  rMin: 52, // radius of the 12 minute markers
  hourChipR: 16, // faint disc behind each hour number
  minChipR: 13,
  hourFont: 18,
  minFont: 14,

  // The dial's footprint is a disc of radius rHour + hourOverhang, so it can sit
  // tangent to the top and right edges however round the display corners are:
  // eroding a rounded rect by a radius at least as large as the corner radius
  // leaves a plain rectangle. hourOverhang is derived so that DIAL_R is the
  // outermost pixel of the marker *sprite*, glow included — not of the circle
  // inside it. Measuring to the circle instead put the sprite box 2px off the
  // right edge at 06:00 and 2px above it at 00:00.
  hourOverhang: DIAL_R - 144 - MARKER_GLOW,
  minOverhang: 15,
  hlHourR: 47,
  hlMinR: 33,
  hlHourBox: 2 * (47 + MARKER_GLOW), // sprite size (marker + glow)
  hlMinBox: 2 * (33 + MARKER_GLOW),
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
const MAX_SPRITE = 104

DIAL.hlHourCentre = DIAL.rHour + DIAL.hourOverhang - DIAL.hlHourR
DIAL.hlMinCentre = DIAL.rMin + DIAL.minOverhang - DIAL.hlMinR
// floor, not round: the size is bounded by how much fits inside the ring, so
// the conservative direction is the correct one.
DIAL.hlHourFont = Math.floor(2 * DIAL.hlHourR * DIAL.markerFontRatio)
DIAL.hlMinFont = Math.floor(2 * DIAL.hlMinR * DIAL.markerFontRatio)

// ---------------------------------------------------------------- tiles ----
const TILE = {
  r: 18, // inner corners — the ones that do not meet the screen
  pad: 6,
  iconSize: 18,
  labelDx: 28,
  labelSize: 13,
  labelDy: 19, // centre line of the icon + label row
  valueDy: 22, // distance from the tile's bottom edge to the value centre
}

/**
 * The column reads right-aligned.
 *
 * The screen's corner arc eats the *left* of a card, so anchoring the readings
 * to the right edge puts them where the glass is, whatever the corner radius
 * turns out to be — a left-aligned value in a 62px card is the first thing to
 * be clipped, and was. The icon still sits at the padding on the label row,
 * which is high enough up the arc to be safe and keeps the column's icons in
 * a straight line.
 */
const COL_LABEL_SIZE = 12
const COL_ICON_SIZE = 14

/**
 * Corner radii for a box, clockwise from top-left.
 *
 * A corner sitting in a screen corner takes the display's radius so the card
 * follows the glass; every other corner takes the normal tile radius. Derived
 * from the box's own position rather than hand-listed, so moving a card cannot
 * leave a stale radius behind.
 */
function corners(box, innerR) {
  const r = innerR === undefined ? TILE.r : innerR
  const left = box.x <= 0
  const right = box.x + box.w >= W
  const top = box.y <= 0
  const bottom = box.y + box.h >= H
  return [
    left && top ? SCREEN_R : r,
    right && top ? SCREEN_R : r,
    right && bottom ? SCREEN_R : r,
    left && bottom ? SCREEN_R : r,
  ]
}

/**
 * Smallest x at which a row sitting `TILE.labelDy` from the top of a card in a
 * screen corner is fully inside that card. Solved from the corner arc rather
 * than eyeballed, so changing SCREEN_R moves the content with it.
 */
const ARC_SAFE_X = Math.ceil(
  SCREEN_R -
    Math.sqrt(
      Math.max(0, SCREEN_R * SCREEN_R - Math.pow(SCREEN_R - TILE.labelDy + TILE.iconSize / 2, 2))
    )
)

/**
 * Is this point on the glass? The screen is a rounded rect, so a point can be
 * inside the 390x450 framebuffer and still be under the bezel.
 *
 * Card artwork may legitimately sit outside — its own corner is arced to match.
 * Readings may not: a value that leaves this region is simply missing on the
 * watch, and reads as a font bug rather than a layout one.
 */
function insideScreen(x, y) {
  const dx = x < SCREEN_R ? SCREEN_R - x : x > W - SCREEN_R ? x - (W - SCREEN_R) : 0
  const dy = y < SCREEN_R ? SCREEN_R - y : y > H - SCREEN_R ? y - (H - SCREEN_R) : 0
  return dx * dx + dy * dy <= SCREEN_R * SCREEN_R
}

/**
 * Lowest y at which content sitting at x=TILE.pad is inside a card that fills
 * the screen's top-left corner. The arc eats the corner from the inside, so
 * the first card is taller than the others by exactly this much rather than
 * having its label hang outside the card.
 */
const ARC_SAFE_Y = Math.ceil(
  SCREEN_R - Math.sqrt(Math.max(0, SCREEN_R * SCREEN_R - Math.pow(SCREEN_R - TILE.pad, 2)))
)

// The column: flush with the top of the screen, stopping one gap short of the
// bars. Card 0 absorbs the corner arc; the other three split what is left.
const COL_H = BAR_TOP - GAP
const CARD_0_H = ARC_SAFE_Y + COL_LABEL_SIZE + 40
const CARD_H = Math.floor((COL_H - CARD_0_H - 3 * GAP) / 3)
const cardY = (i) => (i === 0 ? 0 : CARD_0_H + GAP + (i - 1) * (CARD_H + GAP))
const cardH = (i) => (i === 0 ? CARD_0_H : CARD_H)
// Card 0's rows sit low enough to clear the arc; the rest use the normal offsets.
const cardLabelDy = (i) => (i === 0 ? ARC_SAFE_Y + COL_LABEL_SIZE : TILE.labelDy)

const tileLabelY = (box) => box.y + TILE.labelDy
const tileValueY = (box) => box.y + box.h - TILE.valueDy

/**
 * Every metric cell on the face: where it sits, how it is drawn, and which
 * system app a tap on it opens. Tap targets are the whole tile.
 */
const BATTERY_H = 50 // one row: bolt, reading, wave — no label line above them
const PILL_H = H - BAR_TOP - BATTERY_H - GAP

/**
 * Every metric cell on the face: where it sits, how it is drawn, and which
 * system app a tap on it opens. Tap targets are the whole tile.
 *
 * Readings are placed by *width*, not by topic. The four in the column are the
 * ones that never exceed three characters, which is what lets the column be
 * 62px wide and the dial 164. Anything wider — the date, the distance with its
 * unit, five-digit step counts — goes into a bar, where width is free.
 */
const SLOTS = [
  {
    key: 'hr',
    align: 'right',
    icon: 'heart',
    iconColor: 'primary',
    box: { x: 0, y: cardY(0), w: COL_W, h: cardH(0) },
    label: 'HR',
    labelColor: 'primary',
    labelDy: cardLabelDy(0),
    value: { size: 28, color: 'primary', w: 50 },
    dataType: 'HEART',
    app: 'HR',
  },
  {
    key: 'stress',
    align: 'right',
    icon: 'gauge',
    iconColor: 'iconSteps',
    box: { x: 0, y: cardY(1), w: COL_W, h: cardH(1) },
    label: 'Stress',
    labelColor: 'iconSteps',
    labelDy: cardLabelDy(1),
    value: { size: 28, color: 'primary', w: 50 },
    dataType: 'STRESS',
    app: 'PRESSURE',
  },
  {
    key: 'pai',
    align: 'right',
    icon: 'flame',
    iconColor: 'iconDistance',
    box: { x: 0, y: cardY(2), w: COL_W, h: cardH(2) },
    label: 'PAI',
    labelColor: 'iconDistance',
    labelDy: cardLabelDy(2),
    value: { size: 28, color: 'primary', w: 50 },
    dataType: 'PAI_DAILY',
    app: 'PAI',
  },
  {
    key: 'temp',
    align: 'right',
    icon: 'thermometer',
    iconColor: 'iconDate',
    box: { x: 0, y: cardY(3), w: COL_W, h: cardH(3) },
    label: 'Temp',
    labelColor: 'iconDate',
    labelDy: cardLabelDy(3),
    value: { size: 28, color: 'primary', w: 50 },
    dataType: 'WEATHER_CURRENT',
    app: 'WEATHER',
  },
  {
    // One row. The label line came off and the bolt moved beside the reading,
    // which is 23px of height that went straight into the dial's radius.
    key: 'battery',
    box: { x: 0, y: BAR_TOP, w: W, h: BATTERY_H },
    icon: 'bolt',
    iconColor: 'accent',
    inlineIcon: true,
    meter: { name: 'battery', dx: 104, dy: Math.round((BATTERY_H - 22) / 2), w: 274, h: 22 },
    value: { size: 28, color: 'accent', w: 56, dx: 32 },
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
  if (
    2 * (DIAL.hlHourR + MARKER_GLOW) > DIAL.hlHourBox ||
    2 * (DIAL.hlMinR + MARKER_GLOW) > DIAL.hlMinBox
  ) {
    throw new Error('a marker plus its glow does not fit inside its sprite box')
  }
  // The sprite box, not the circle, is what the runtime places — so it is the
  // box that has to stay on screen at the four extreme positions.
  const reach = DIAL.hlHourCentre + DIAL.hlHourBox / 2
  for (const [side, room] of [
    ['right', W - DIAL.cx],
    ['left', DIAL.cx - COL_W],
    ['top', DIAL.cy],
    ['bottom', BAR_TOP - DIAL.cy],
  ]) {
    if (reach > room) {
      throw new Error(`hour marker sprite runs ${reach - room}px past the ${side} limit`)
    }
  }
  const aodReach = AOD.rHour + DIAL.hlHourBox / 2
  const aodRoom = Math.min(AOD.cx, AOD.cy, W - AOD.cx, H - AOD.cy)
  if (aodReach > aodRoom) {
    throw new Error(`AOD hour ring runs ${aodReach - aodRoom}px off screen`)
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
  x: 0,
  y: BAR_TOP + BATTERY_H + GAP,
  w: W,
  h: PILL_H,
  // Only the corners that do not meet the screen: the bottom two take SCREEN_R
  // from corners(). Kept near half-height so the bar still reads as a stadium.
  r: 30,
  labelSize: 15,
  valueSize: 24,
  divInset: 16,
  cellPad: 16, // breathing room each cell gets on top of its reading
  // The wide readings, where 390px of bar makes their width free. `flex` sizes
  // each cell to its own content — the date needs half again what a bare number
  // does, and equal cells would either clip it or waste the rest.
  // `w` is the reading's own width at valueSize, measured on the device for the
  // worst case it can show. Cell widths are derived from it, so a cell can
  // never end up narrower than the number it has to hold.
  cells: [
    { key: 'date', label: 'Date', app: 'CALENDAR', w: 92 },
    { key: 'distance', label: 'Dist KM', dataType: 'DISTANCE', app: 'STATUS', w: 50 },
    { key: 'steps', label: 'Steps', dataType: 'STEP', app: 'STATUS', w: 70 },
    { key: 'kcal', label: 'Kcal', dataType: 'CAL', app: 'STATUS', w: 70 },
  ],
}

/**
 * The bar's artwork runs to the screen edge; its readings do not.
 *
 * At the height of the value row the glass has already curved inwards, so the
 * cells are laid out across an inset span. Derived from the arc at the lowest
 * ink rather than picked, so it tracks SCREEN_R.
 */
const PILL_INK_BOTTOM = PILL.y + PILL.h - TILE.valueDy + PILL.valueSize * 0.65
const PILL_INSET = Math.ceil(
  SCREEN_R -
    Math.sqrt(
      Math.max(0, SCREEN_R * SCREEN_R - Math.pow(PILL_INK_BOTTOM - (H - SCREEN_R), 2))
    )
)

const cellFlex = PILL.cells.map((c) => c.w + PILL.cellPad)
const flexTotal = cellFlex.reduce((a, b) => a + b, 0)
const cellSpan = PILL.w - 2 * PILL_INSET
// Cumulative edges, rounded once and shared, so the cells tile the span exactly.
const cellEdges = cellFlex.reduce(
  (acc, f) => acc.concat(acc[acc.length - 1] + (f / flexTotal) * cellSpan),
  [PILL.x + PILL_INSET]
)
const cellEdge = (i) => Math.round(cellEdges[i])
const cellW = cellSpan / PILL.cells.length // kept for callers that want a nominal width
const cellCenter = (i) => Math.round((cellEdges[i] + cellEdges[i + 1]) / 2)
const cellDivider = (i) => cellEdge(i + 1) // i = 0..cells-2

// --------------------------------------------------------------- AOD -------
// Centred on the screen rather than inheriting the dial's top-right position,
// since none of the tiles are drawn in this state.
const AOD = {
  cx: 195,
  cy: 210,
  // Roomier than the daytime dial — with the tiles gone there is space for it,
  // and the wider inner ring leaves the digital time an uncluttered middle.
  // The chips sit *on* their rings here instead of growing inwards.
  // Bounded like the daytime dial: the marker *sprite* has to stay on screen,
  // and it grew with DIAL_R. checkGeometry() asserts it.
  rHour: 144,
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
  // A droplet on a gauge arc: stress is scored, not counted.
  thermometer:
    '<g><path d="M14.5 13.6V4.9a2.5 2.5 0 0 0-5 0v8.7a4.8 4.8 0 1 0 5 0z"/>' +
    '<circle cx="12" cy="17.4" r="2.6" fill="none"/></g>',
  // A flame — PAI is earned by effort, not distance.
  flame:
    '<path d="M12.6 1.8c.6 3-1 4.4-2.5 5.9C8.4 9.3 6.8 11 6.8 14a5.2 5.2 0 0 0 10.4 0c0-1.4-.5-2.4-1.2-3.4-.3.9-1 1.6-1.9 1.6 1-3.6-.4-8-1.5-10.4z"/>',
  // A dial with a needle: a stress score, not a count.
  gauge:
    '<g><path d="M12 4.2a9 9 0 0 0-9 9 8.9 8.9 0 0 0 1.5 5 1.4 1.4 0 0 0 1.2.6h12.6a1.4 1.4 0 0 0 1.2-.6 8.9 8.9 0 0 0 1.5-5 9 9 0 0 0-9-9zm0 3.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z" fill="none" stroke-width="2" stroke="currentColor"/>' +
    '<path d="M12 4.6a8.6 8.6 0 0 0-8.6 8.6c0 1.7.5 3.3 1.4 4.7h2.5a6.2 6.2 0 1 1 9.4 0h2.5a8.5 8.5 0 0 0 1.4-4.7A8.6 8.6 0 0 0 12 4.6z"/>' +
    '<path d="M15.6 9.4 11 13a1.5 1.5 0 1 0 2 2z"/></g>',
  bolt: '<path d="M13.8 1.5 4.4 13.2c-.4.5 0 1.3.7 1.3h4.3l-1.5 8c-.1.8.9 1.3 1.4.6l9.4-11.7c.4-.5 0-1.3-.7-1.3h-4.3l1.5-8c.2-.8-.9-1.3-1.4-.6z"/>',
}

module.exports = {
  W,
  H,
  SCREEN_R,
  DIAL_R,
  COL_W,
  BAR_TOP,
  GAP,
  CARD_H,
  CARD_0_H,
  COL_LABEL_SIZE,
  COL_ICON_SIZE,
  ARC_SAFE_Y,
  corners,
  insideScreen,
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
  cellEdge,
  cellCenter,
  cellDivider,
  PILL_INSET,
  polar,
  hsl,
  ringHue,
  hourColor,
  minuteLabelColor,
  pad2,
}
