/**
 * Orbit Energy — offline runtime harness.
 *
 * Loads watchface/index.js against stubbed @zos modules, runs the real
 * lifecycle (onInit -> build -> onPerMinute), then rasterises every widget it
 * created. The output is what the device will actually draw, so layout and
 * asset-path mistakes surface here instead of on the watch.
 *
 *   node tools/simulate.cjs [hour] [minute] [--aod]
 */

const fs = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')
const { PNG } = require('pngjs')
const D = require('./design.cjs')

const ROOT = path.resolve(__dirname, '..')
const ASSETS = path.join(ROOT, 'assets', 'default')
const OUT_DIR = path.join(__dirname, '..', '.render')

const argv = process.argv.slice(2)
const AOD_MODE = argv.includes('--aod')
const HOUR = Number(argv[0] !== undefined && !argv[0].startsWith('--') ? argv[0] : 18)
const MINUTE = Number(argv[1] !== undefined && !argv[1].startsWith('--') ? argv[1] : 19)

const LV_NORMAL = 0x1
const LV_AOD = 0x2
const LV_EDIT = 0x4

// ------------------------------------------------------------ zos stubs ----

const align = { LEFT: 'LEFT', RIGHT: 'RIGHT', CENTER_H: 'CENTER_H', TOP: 'TOP', BOTTOM: 'BOTTOM', CENTER_V: 'CENTER_V' }
const text_style = { NONE: 0, WRAP: 1, ELLIPSIS: 2, CHAR_WRAP: 3 }
const prop = { MORE: 'MORE', X: 'X', Y: 'Y', VISIBLE: 'VISIBLE', CURRENT_TYPE: 'CURRENT_TYPE' }

/** Which theme the edit widget reports back. SIM_THEME=3 renders Graphite. */
const THEME_ID = Number(process.env.SIM_THEME || 1)
const widget = {
  IMG: 'IMG',
  IMG_CLICK: 'IMG_CLICK',
  BUTTON: 'BUTTON',
  WIDGET_DELEGATE: 'WIDGET_DELEGATE',
  WATCHFACE_EDIT_BG: 'WATCHFACE_EDIT_BG',
  TEXT: 'TEXT',
  FILL_RECT: 'FILL_RECT',
  TEXT_IMG: 'TEXT_IMG',
  ARC: 'ARC',
  IMG_LEVEL: 'IMG_LEVEL',
}
// The firmware has no hmUI global — everything the watchface uses comes from
// @zos/ui. SIM_BARE=1 strips the members that are undocumented there
// (deleteWidget, IMG_CLICK, prop.VISIBLE, the watchface data types) to
// exercise the fallback paths.
const BARE = process.env.SIM_BARE === '1'
if (BARE) {
  delete widget.IMG_CLICK
  delete prop.VISIBLE
  delete widget.WATCHFACE_EDIT_BG
  delete prop.CURRENT_TYPE
}

const data_type = {
  HEART: 1, STEP: 2, DISTANCE: 3, CAL: 4, BATTERY: 5,
  STRESS: 6, PAI_DAILY: 7, WEATHER_CURRENT: 'WEATHER_CURRENT',
}
if (BARE) {
  // watchface-only members the @zos/ui typings do not promise
  for (const k of ['STEP', 'STRESS', 'PAI_DAILY', 'WEATHER_CURRENT']) delete data_type[k]
}

const timers = []
const timerApi = {
  createSysTimer: (periodic, period, cb) => {
    timers.push({ periodic, period, cb })
    return timers.length
  },
  stopTimer: (id) => {
    timers[id - 1] = null
  },
}

const created = []

const deleteWidget = BARE
  ? undefined
  : (w) => {
      const i = created.indexOf(w)
      if (i >= 0) created.splice(i, 1)
      return true
    }

function createWidget(type, options) {
  const w = { type, props: Object.assign({}, options) }
  created.push(w)
  if (type === widget.WATCHFACE_EDIT_BG) w.props[prop.CURRENT_TYPE] = THEME_ID
  w.setProperty = (which, patch) => {
    if (which !== prop.MORE) throw new Error('unexpected prop ' + which)
    Object.assign(w.props, patch)
  }
  w.getProperty = (which) => w.props[which]
  return w
}

// Canned sensor readings — plausible mid-day values. Override any of them with
// SIM='{"steps":98765}' to check how the layout copes with extremes.
const READING = Object.assign(
  {
    heartRate: 87,
    steps: 4505,
    distanceMetres: 3502,
    stand: 8,
    standTarget: 12,
    calorie: 450,
    stress: 56,
    paiTotal: 23,
    paiToday: 0, // realistic: nothing earned yet today
    battery: 65,
    weekday: 2, // 1 = Monday; 3 = WED is the widest weekday
    dayOfMonth: 30,
  },
  process.env.SIM ? JSON.parse(process.env.SIM) : {}
)

const perMinute = []

class Time {
  getHours() { return HOUR }
  getMinutes() { return MINUTE }
  getDate() { return READING.dayOfMonth }
  getDay() { return READING.weekday }
  getMonth() { return 8 }
  getFullYear() { return 2026 }
  onPerMinute(cb) { perMinute.push(cb) }
}
class Battery { getCurrent() { return READING.battery } onChange() {} offChange() {} }
class Step { getCurrent() { return READING.steps } getTarget() { return 8000 } onChange() {} offChange() {} }
class HeartRate {
  getCurrent() { return READING.heartRate }
  getLast() { return READING.heartRate }
  onCurrentChange() {} offCurrentChange() {}
  onLastChange() {} offLastChange() {}
}
class Distance { getCurrent() { return READING.distanceMetres } onChange() {} offChange() {} }
class Stand {
  getCurrent() { return READING.stand }
  getTarget() { return READING.standTarget }
  onChange() {} offChange() {}
}
class Calorie { getCurrent() { return READING.calorie } getTarget() { return 500 } onChange() {} offChange() {} }
class Stress { getCurrent() { return { value: READING.stress, time: 0 } } onChange() {} offChange() {} }
class Pai { getToday() { return READING.paiToday } getTotal() { return READING.paiTotal } }

const launched = []
const SYSTEM_APPS = {
  SYSTEM_APP_HR: 10001,
  SYSTEM_APP_STATUS: 10002,
  SYSTEM_APP_CALENDAR: 10003,
  SYSTEM_APP_SETTING: 10004,
  SYSTEM_APP_WEATHER: 10005,
  SYSTEM_APP_PRESSURE: 10006,
  SYSTEM_APP_PAI: 10007,
}
const APP_NAME = {}
Object.keys(SYSTEM_APPS).forEach((k) => {
  APP_NAME[SYSTEM_APPS[k]] = k
})

const MODULES = {
  '@zos/ui': { createWidget, deleteWidget, widget, prop, align, text_style, data_type },
  '@zos/sensor': { Time, Battery, Step, HeartRate, Distance, Stand, Calorie, Stress, Pai },
  '@zos/timer': timerApi,
  '@zos/router': Object.assign(
    { launchApp: (opt) => launched.push(opt) },
    SYSTEM_APPS
  ),
}

// ------------------------------------------------------------ ESM shim -----

/**
 * Rewrites the watchface's ES modules into something require() can run.
 *
 * Exports become plain `const` declarations plus a trailing assignment, so an
 * export that references another one (TEMP_FONT builds on IMAGE) resolves the
 * same way it would in a real module.
 */
function toCommonJs(source, resolveImport) {
  const names = []
  let out = source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'([^']+)'/g, (_, imported, from) => {
    const clean = imported.replace(/\s+/g, ' ').trim()
    return `const { ${clean} } = ${resolveImport(from)}`
  })
  out = out.replace(/^export const (\w+)/gm, (_, name) => {
    names.push(name)
    return 'const ' + name
  })
  if (names.length) {
    out += '\n' + names.map((n) => `exports.${n} = ${n}`).join('\n') + '\n'
  }
  return out
}

function loadModule(file, resolveImport) {
  const src = toCommonJs(fs.readFileSync(file, 'utf8'), resolveImport)
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  const fn = new Function('module', 'exports', 'require', 'WatchFace', 'console', src)
  fn(module, module.exports, require, globalThis.WatchFace, console)
  return module.exports
}

const layout = loadModule(path.join(ROOT, 'watchface', 'layout.js'), () => '({})')

const problemsLater = []

let face = null
globalThis.WatchFace = (definition) => {
  face = definition
}

const watchfaceSrc = toCommonJs(
  fs.readFileSync(path.join(ROOT, 'watchface', 'index.js'), 'utf8'),
  (from) => (from === './layout' ? '__layout' : `__modules[${JSON.stringify(from)}]`)
)

// eslint-disable-next-line no-new-func
new Function('__modules', '__layout', 'WatchFace', 'console', watchfaceSrc)(
  MODULES,
  layout,
  globalThis.WatchFace,
  console
)

if (!face) throw new Error('WatchFace() was never called')

face.onInit()
face.build()
perMinute.forEach((cb) => cb())

// screen off -> screen on, then one poll tick
const delegate = created.find((w) => w.type === widget.WIDGET_DELEGATE)
if (!delegate) {
  problemsLater.push('no WIDGET_DELEGATE — the face would not refresh on wake')
} else {
  delegate.props.pause_call()
  delegate.props.resume_call()
}
timers.filter(Boolean).forEach((t) => t.cb())

// --------------------------------------------------------------- checks ----

const problems = problemsLater

for (const w of created) {
  const p = w.props
  // WIDGET_DELEGATE is virtual: lifecycle only, it never draws
  if (w.type === widget.WIDGET_DELEGATE) continue
  // WATCHFACE_EDIT_BG is full-screen and carries no w/h of its own
  if (w.type === widget.WATCHFACE_EDIT_BG) continue
  if (p.src) {
    const file = path.join(ASSETS, p.src)
    if (!fs.existsSync(file)) problems.push(`missing asset: ${p.src}`)
  }
  if (Array.isArray(p.font_array)) {
    for (const f of p.font_array) {
      if (!fs.existsSync(path.join(ASSETS, f))) problems.push(`missing font glyph: ${f}`)
    }
  }
  for (const key of ['unit_en', 'unit_sc', 'unit_tc', 'negative_image', 'invalid_image']) {
    if (p[key] && !fs.existsSync(path.join(ASSETS, p[key]))) {
      problems.push(`missing ${key}: ${p[key]}`)
    }
  }
  for (const key of ['x', 'y', 'w', 'h']) {
    if (typeof p[key] !== 'number' || Number.isNaN(p[key])) {
      problems.push(`${w.type} has invalid ${key}: ${p[key]}`)
    }
  }
  if (p.x < 0 || p.y < 0 || p.x + p.w > D.W || p.y + p.h > D.H) {
    problems.push(`${w.type} out of bounds: x=${p.x} y=${p.y} w=${p.w} h=${p.h} text=${p.text || p.src || ''}`)
  }
}

// ---------------------------------------------------------------- render ---

const round = (n) => Math.round(n * 100) / 100
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6)

function dataUri(file) {
  return 'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, file)).toString('base64')
}

function renderText(p) {
  const size = p.text_size || 16
  const cy = p.y + p.h / 2
  let x = p.x
  let anchor = 'start'
  if (p.align_h === align.CENTER_H) {
    x = p.x + p.w / 2
    anchor = 'middle'
  } else if (p.align_h === align.RIGHT) {
    x = p.x + p.w
    anchor = 'end'
  }
  return (
    `<text x="${round(x)}" y="${round(cy + size * 0.35)}" font-family="Segoe UI" ` +
    `font-size="${size}" font-weight="600" fill="${hex(p.color)}" text-anchor="${anchor}">` +
    String(p.text == null ? '' : p.text).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
    '</text>'
  )
}

/** TEXT_IMG bound to WEATHER_CURRENT: lay the glyph images out by hand. */
function renderTextImg(p) {
  const value = '23'
  const glyphs = value.split('').map((c) => p.font_array[Number(c)])
  if (p.unit_en) glyphs.push(p.unit_en)
  const info = glyphs.map((g) => {
    const buf = fs.readFileSync(path.join(ASSETS, g))
    return { src: g, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  })
  const space = p.h_space || 0
  const total = info.reduce((s, g) => s + g.w, 0) + space * (info.length - 1)
  let x = p.align_h === align.CENTER_H ? p.x + (p.w - total) / 2 : p.x
  const y = p.y + (p.h - info[0].h) / 2
  return info
    .map((g) => {
      const tag = `<image href="${dataUri(g.src)}" x="${round(x)}" y="${round(y)}" width="${g.w}" height="${g.h}"/>`
      x += g.w + space
      return tag
    })
    .join('')
}

function renderScene(level) {
  let body = `<rect width="${D.W}" height="${D.H}" fill="#000"/>`
  for (const w of created) {
    const p = w.props
    const show = p.show_level == null ? 0xff : p.show_level
    if (!(show & level)) continue

    if (w.type === widget.WATCHFACE_EDIT_BG) {
      // What the editor itself paints: the candidate theme's full-face
      // `preview` while cycling, its `path` once committed.
      const cfg = w.props.bg_config.filter((c) => c.id === THEME_ID)[0] || w.props.bg_config[0]
      const src = level & LV_EDIT ? cfg.preview : cfg.path
      body += `<image href="${dataUri(src)}" x="0" y="0" width="${D.W}" height="${D.H}"/>`
    } else if (w.type === widget.IMG) {
      body += `<image href="${dataUri(p.src)}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`
    } else if (w.type === widget.FILL_RECT) {
      body +=
        `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" ` +
        `rx="${p.radius || 0}" fill="${hex(p.color)}"/>`
    } else if (w.type === widget.TEXT) {
      body += renderText(p)
    } else if (w.type === widget.TEXT_IMG) {
      body += renderTextImg(p)
    }
    // IMG_CLICK zones are fully transparent; nothing to draw.
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${D.W}" height="${D.H}" viewBox="0 0 ${D.W} ${D.H}">${body}</svg>`
  )
}

function write(level, file) {
  const svg = renderScene(level)
  const png = new Resvg(svg, {
    font: {
      fontFiles: ['segoeui.ttf', 'seguisb.ttf', 'segoeuib.ttf']
        .map((f) => path.join('C:/Windows/Fonts', f))
        .filter((f) => fs.existsSync(f)),
      loadSystemFonts: false,
      defaultFontFamily: 'Segoe UI',
    },
    fitTo: { mode: 'original' },
  })
    .render()
    .asPng()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, file), png)
  return path.join(OUT_DIR, file)
}

// ------------------------------------------------------------------ main ---

// Exercise every tap zone and report which system app it would open.
const zones = created.filter((w) => typeof w.props.click_func === 'function')
for (const z of zones) {
  if (typeof z.props.click_func === 'function') z.props.click_func()
  else if (typeof z.props.click_up === 'function') z.props.click_up()
  else problems.push(`tap zone at ${z.props.x},${z.props.y} has no handler`)
}
if (zones.length && launched.length !== zones.length) {
  problems.push(`${zones.length} tap zones but ${launched.length} launched`)
}

const isMarker = (w) => /(^|\/)hl\//.test(String(w.props.src || ''))
const markers = created.filter(isMarker)
if (markers.length !== 4) {
  problems.push(`expected 4 orbital markers, found ${markers.length}`)
} else if (!BARE && created.findIndex(isMarker) < created.length - 4) {
  problems.push('orbital markers are not the last widgets — they would not draw on top')
}
for (const w of created) {
  if (w.type !== widget.WATCHFACE_EDIT_BG) continue
  for (const entry of w.props.bg_config || []) {
    for (const key of ['path', 'preview']) {
      if (!fs.existsSync(path.join(ASSETS, entry[key]))) {
        problems.push(`theme ${entry.id} ${key} missing: ${entry[key]}`)
      }
    }
  }
  if (w.props.count !== (w.props.bg_config || []).length) {
    problems.push('WATCHFACE_EDIT_BG count does not match bg_config length')
  }
}

// IMG_CLICK paints its src permanently, so a hit area that is not fully
// transparent shows up as a box drawn over the tile.
for (const w of created) {
  if (w.type !== widget.IMG_CLICK || !w.props.src) continue
  const img = PNG.sync.read(fs.readFileSync(path.join(ASSETS, w.props.src)))
  let opaque = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) opaque++
  if (opaque) problems.push(`hit area ${w.props.src} has ${opaque} visible pixels — it would draw over the tile`)
}

for (const m of markers) {
  if (m.props.w !== m.props.h || !m.props.w) problems.push('marker has no square size')
  if (m.props.w > D.MAX_SPRITE) problems.push(`marker sprite ${m.props.w}px exceeds MAX_SPRITE`)
}

// In edit mode WATCHFACE_EDIT_BG shows `preview`, a full render of the whole
// face in the candidate theme. Any other widget left visible there paints over
// it in the *current* theme's colours, so the carousel shows two faces at once.
const LV_EDIT_MASK = 0x4
for (const w of created) {
  // WATCHFACE_EDIT_BG owns edit mode. WIDGET_DELEGATE draws nothing — it is
  // the resume_call/pause_call hook, and narrowing its show_level would risk
  // the lifecycle callbacks that keep the minute marker moving.
  if (w.type === widget.WATCHFACE_EDIT_BG || w.type === widget.WIDGET_DELEGATE) continue
  const show = w.props.show_level
  if (show == null) {
    problems.push(`${w.type} has no show_level — it defaults to visible in edit mode`)
  } else if (show & LV_EDIT_MASK) {
    problems.push(`${w.type} at ${w.props.x},${w.props.y} is visible in edit mode`)
  }
}

const live = timers.filter(Boolean)
if (live.length !== 1) problemsLater.push(`expected exactly 1 poll timer, found ${live.length}`)
else console.log(`poll timer: every ${live[0].period / 1000}s while awake`)

const themeName = (D.THEMES.filter((t) => t.id === THEME_ID)[0] || D.THEMES[0]).name
console.log(`theme ${THEME_ID} (${themeName})`)

console.log(`widgets created: ${created.length}`)
const byType = {}
created.forEach((w) => {
  byType[w.type] = (byType[w.type] || 0) + 1
})
console.log('  ' + Object.entries(byType).map(([k, v]) => `${k}=${v}`).join('  '))

if (zones.length) {
  console.log(`tap zones: ${zones.length}`)
  launched.forEach((opt, i) => {
    const z = zones[i].props
    console.log(`  ${String(z.x).padStart(3)},${String(z.y).padStart(3)} ${z.w}x${z.h}  ->  ${APP_NAME[opt.appId] || opt.appId}`)
  })
}

if (problems.length) {
  console.log('\nPROBLEMS:')
  problems.forEach((p) => console.log('  ✗ ' + p))
} else {
  console.log('  ✓ all assets resolve and every widget is on-screen')
}

console.log('\n' + write(LV_NORMAL, `t${THEME_ID}-${D.pad2(HOUR)}${D.pad2(MINUTE)}.png`))
console.log(write(LV_EDIT, `edit-t${THEME_ID}.png`))
if (AOD_MODE) console.log(write(LV_AOD, `aod-${D.pad2(HOUR)}${D.pad2(MINUTE)}.png`))

face.onDestroy()
