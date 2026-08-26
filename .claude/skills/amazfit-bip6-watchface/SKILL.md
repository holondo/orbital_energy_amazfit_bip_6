---
name: "amazfit-bip6-watchface"
description: "Build, debug, and ship a custom watchface for the Amazfit Bip 6 (Zepp OS 5, framework 4.2, 390x450) with the Zeus CLI. Use when creating a watchface from a design mockup, generating its PNG assets, wiring sensors and tap hot zones, or diagnosing a face that renders black, freezes, truncates sprites, or ignores touches. Covers the modern @zos module API, the traps that are not in the official docs, and how to verify everything without a physical watch. Do not use for Zepp OS mini-apps (pages/), for watchfaces built in Watchface Maker, or for other Amazfit models without re-checking the device constants."
---

# Amazfit Bip 6 watchface development

Everything here was established empirically against a real Bip 6 running
**framework 4.2 (Zepp OS 5.0, API level 4.2)**. The device constants and the
traps in "Firmware behaviour" are the parts you cannot get from the docs — read
those before writing code, and re-verify them if you target another model.

---

## 1. Ground truth about this device

| Fact | Value |
| --- | --- |
| Screen | 390 x 450, rounded corners (~45 px radius) |
| `deviceSource` | `9765120`, `9765121`, `10158337` (three variants — declare all) |
| Framework | 4.2 |
| Legacy globals `hmUI` / `hmApp` / `hmSensor` / `hmSetting` | **absent** |
| `widget.IMG_CLICK` (from `@zos/ui`) | present, `17` |
| `deleteWidget` (from `@zos/ui`) | present |
| `prop.VISIBLE` | present, `42` |
| `show_level` constants | not exported; use literals `0x1` normal, `0x2` AOD, `0x4` edit |

Confirm the shape of the API on any new firmware by logging it at startup
rather than assuming:

```js
console.log('IMG_CLICK=' + widget.IMG_CLICK +
            ' deleteWidget=' + (typeof deleteWidget === 'function') +
            ' VISIBLE=' + prop.VISIBLE)
```

Read the log with:

```powershell
Get-Content "$env:LOCALAPPDATA\Programs\simulator\sim-debug.log" -Tail 40
```

### The legacy-global trap

Older watchfaces (including the stock ones you can extract from a `.zab`) use
`hmUI.*` and `hmApp.startApp`. They were compiled with the old toolchain, which
injected those objects. **A watchface built with a current Zeus does not get
them**, and touching one takes down the whole face:

```
TypeError: cannot read property 'widget' of null
```

Everything must come from `@zos/*`. And watch the guard shape — this is wrong:

```js
// BUG: when HMUI is null the whole expression is null, and null !== undefined
const T = (HMUI && HMUI.widget && HMUI.widget.IMG_CLICK) !== undefined
  ? HMUI.widget.IMG_CLICK    // <- dereferences null
  : fallback
```

Probe one level at a time, or just read straight off the module object.

---

## 2. Project shape

```
app.json                  manifest
app.js                    App({}) shell
watchface/index.js        the face
watchface/layout.js       GENERATED coordinates + colours + asset names
assets/default/           GENERATED PNGs (target key "default" -> assets/default)
tools/*.cjs               build-time only, never shipped
```

**Name build-time scripts `.cjs`.** Zeus feeds every `.js` file under the
project root to Rollup as a bundle entry. A Node script that requires a native
module (like a rasteriser) crashes the build with `PLUGIN_ERROR` /
`PARSE_ERROR` on a `.node` binary. The `.cjs` extension makes the bundler skip
them while Node still runs them.

### app.json essentials

```json
{
  "configVersion": "v2",
  "app": { "appId": 24618, "appType": "watchface", "icon": "icon.png",
           "cover": ["preview.png"] },
  "permissions": [
    "data:user.hd.heart_rate", "data:user.hd.step", "data:user.hd.distance",
    "data:user.hd.calorie", "data:user.hd.stress", "data:user.hd.pai"
  ],
  "runtime": { "apiVersion": { "compatible": "3.0.0", "target": "4.0.0",
                               "minVersion": "3.0.0" } },
  "targets": { "default": {
    "module": { "watchface": { "path": "watchface/index", "main": 1,
                               "lockscreen": 1, "editable": 0 } },
    "platforms": [ { "name": "Amazfit Bip 6", "deviceSource": 9765120 },
                   { "name": "Amazfit Bip 6", "deviceSource": 9765121 },
                   { "name": "Amazfit Bip 6", "deviceSource": 10158337 } ],
    "designWidth": 390 } }
}
```

- `@zos/sensor` classes need permissions. The built-in data widgets
  (`TEXT_IMG` + `data_type`) do not — the stock faces ship with `"permissions": []`.
- `app.icon` for a watchface is the **preview thumbnail**, not an app icon.
  Zeus rescales it to 266 px wide. Feed it the full 390x450 render of the face.

### Commands

```
npm run assets   node tools/build-assets.cjs   (regenerate PNGs + layout.js)
npm run build    zeus build --ip false         (dist/*.zab)
npm run dev      zeus dev                      (push to a running simulator, watch)
zeus preview                                   (QR code to install on the watch)
zeus status                                    (login + simulator connection)
```

`zeus dev` only helps if the **emulator device is actually started** inside the
simulator window. If it is merely open, files are copied and nothing happens —
check with `tasklist | grep qemu`.

> **`zeus dev` overwrites `.gitignore`** with its own defaults on every run (it
> misreads `parse-gitignore@2`'s return value). Mirror project-specific rules
> into `.git/info/exclude`, which it does not touch.

---

## 3. Firmware behaviour you cannot get from the docs

These five cost the most time. Design around them from the start.

### 3.1 Updates that land while the screen is off are not drawn

This is the root of several symptoms that look unrelated:

- the minute marker "freezes" and skips values
- a sprite comes back rendered as only part of itself
- a value is stale after wrist-raise

`Time.onPerMinute` is suspended while the screen is off and **does not fire on
wake**. Fix with the watchface lifecycle widget:

```js
createWidget(widget.WIDGET_DELEGATE, {
  resume_call: () => { this.refreshAll(); this.startPolling() },
  pause_call: () => this.stopPolling(),
})
```

`WIDGET_DELEGATE` is virtual — it draws nothing, has no geometry, and exists
purely for lifecycle. Pair it with a poll timer that only runs while awake:

```js
import { createSysTimer, stopTimer } from '@zos/timer'
this.timer = createSysTimer(true, 30000, () => this.refreshAll())
```

Three mechanisms together, because none alone is sufficient: `onPerMinute` for
the exact tick, `resume_call` for wake, the timer for everything in between.

### 3.2 `text_style.NONE` means "keep scrolling"

It reads like "no processing", so it is the natural default to reach for. It is
the **marquee**: any `TEXT` whose content is as wide as its box scrolls
forever. A date that measures 82 px in an 82 px box animates permanently.

Use `text_style.ELLIPSIS` for readings. It holds still and trims only if the
text genuinely overruns.

Size the boxes from the device's own font, not from the one your generator
draws with. Screenshot the face, then measure the ink extents of each string
inside its known box (`tools/measure-text.cjs` here) and give every box a few
pixels of slack over its worst realistic content.

### 3.3 Partial `setProperty(prop.MORE, {...})` patches are unreliable

Patching a subset of a live widget's options does not reliably apply. Observed:
a `FILL_RECT` never changed width, and a moved `IMG` came back drawn as only
its top-left corner.

**Re-create instead of mutate.** It also fixes z-order for free, because a new
widget is appended to the end of the display list:

```js
placeMarker(name, pos, src, box, level) {
  const previous = this.widgets[name]
  const options = { x: pos[0], y: pos[1], w: box, h: box, src, show_level: level }
  if (previous) {
    if (typeof deleteWidget === 'function') deleteWidget(previous)
    else {                       // fallback: restate w/h, blink visibility
      if (prop.VISIBLE !== undefined) previous.setProperty(prop.VISIBLE, false)
      previous.setProperty(prop.MORE, options)
      if (prop.VISIBLE !== undefined) previous.setProperty(prop.VISIBLE, true)
      return
    }
  }
  this.widgets[name] = createWidget(widget.IMG, options)
}
```

Swapping only `src` on an `IMG` **does** work reliably. So for anything with a
level — a progress bar, a gauge, a wave — pre-render a strip of frames and swap
`src`, instead of resizing a widget:

```js
const step = Math.round(clamp(ratio, 0, 1) * (STEPS - 1))
w.setProperty(prop.MORE, { src: 'meter/hr/' + pad2(step) + '.png' })
```

Text updates via `setProperty(prop.MORE, { text })` are fine.

### 3.4 There is no sprite size limit — do not invent one

A 56x56 sprite once rendered as its top-left 48x48 while a 52x52 one beside it
was perfect. That looks exactly like a size cap. **It is not.** `bg.png` is
390x450 and never truncates. The two markers differed in *when* they were last
updated: the hour had changed with the screen off, the minute seconds earlier
with it on. It is symptom 3.1 wearing a disguise. Fix the lifecycle, and size
is free again.

### 3.5 Z-order is creation order

The background image must be created first; anything that must sit on top must
be created last. Because markers are re-created on every change, they naturally
stay above widgets created after them at build time (tap zones included).

---

## 4. Touch: hot zones

**`IMG_CLICK` does not take a callback.** It takes a `type` from `data_type`,
and the firmware routes the tap to whatever app owns that metric. Passing
`click_func` to it fails silently — no error, no navigation. This is how the
stock faces do it.

```js
createWidget(widget.IMG_CLICK, {
  x, y, w, h,
  src: 'hit/120x78.png',    // see warning below
  type: data_type.HEART,
  show_level: LV_NORMAL,
})
```

**`src` is painted permanently, not only while held.** The docs say "image to
be displayed when clicked", which reads like press feedback; in practice it is
always on screen. Anything visible there becomes a permanent box drawn over
your tile. Use a fully transparent PNG sized exactly to the zone, and assert
that it is transparent in your tests.

For a zone with no matching metric (a date/calendar tile), use a `BUTTON` and
route it yourself:

```js
import { launchApp, SYSTEM_APP_CALENDAR } from '@zos/router'

createWidget(widget.BUTTON, {
  x, y, w, h, text: '',
  normal_src: transparentPng, press_src: transparentPng,
  click_func: () => launchApp({ appId: SYSTEM_APP_CALENDAR, native: true }),
  show_level: LV_NORMAL,
})
```

`BUTTON`'s `normal_src` is honoured, so a transparent one really is invisible.

### Mapping used here

| Tile | `data_type` | `SYSTEM_APP_*` fallback |
| --- | --- | --- |
| Heart rate | `HEART` | `SYSTEM_APP_HR` |
| Distance / Steps / Kcal | `DISTANCE` / `STEP` / `CAL` | `SYSTEM_APP_STATUS` |
| Battery | `BATTERY` | `SYSTEM_APP_SETTING` (no battery app exists) |
| Temperature | `WEATHER_CURRENT` | `SYSTEM_APP_WEATHER` |
| Stress | `STRESS` | `SYSTEM_APP_PRESSURE` |
| PAI | `PAI_DAILY` | `SYSTEM_APP_PAI` |
| Date | — | `SYSTEM_APP_CALENDAR` |

`STEP`, `STRESS`, `PAI_DAILY` and `WEATHER_CURRENT` are **not** in the
`@zos/ui` typings but exist at runtime. Probe with
`data_type[name] !== undefined` and fall back to a `BUTTON`.

---

## 5. Themes — the editable watchface

The pencil icon on the watchface list, and the carousel of colour variants
behind it, come from one manifest flag plus one widget.

**app.json**, inside the watchface module:

```json
"watchface": { "path": "watchface/index", "main": 1, "editable": 1 }
```

**The widget.** `WATCHFACE_EDIT_BG` both draws the background and provides the
carousel. Create it *instead of* your background `IMG`, and create it first so
everything else lands on top:

```js
const editBg = createWidget(widget.WATCHFACE_EDIT_BG, {
  edit_id: 103,             // unique among the WATCHFACE_EDIT_* widgets
  x: 0, y: 0,
  bg_config: [
    { id: 1, path: 't1/bg.png', preview: 't1/preview.png' },
    { id: 2, path: 't2/bg.png', preview: 't2/preview.png' },
  ],
  count: 2,
  default_id: 1,
  fg: 'edit/fg.png',        // full-screen overlay drawn above the background
  tips_x: 178, tips_y: 428,
  tips_bg: 'edit/tips.png', // backdrop for the "swipe to change" hint
  show_level: LV_NORMAL | LV_EDIT,
})
```

`count` and `default_id` are **siblings** of `bg_config`, not fields inside it.

- `path` — the background drawn in normal mode for that theme.
- `preview` — what the carousel shows while cycling. The stock faces make this
  a **full-screen render of the entire face** in that theme (400x450 in the
  extracted package), not a thumbnail: during editing the user is looking at
  this image, not at your widgets.

**Reading the choice back:**

```js
const themeId = editBg.getProperty(prop.CURRENT_TYPE) || 1
```

`prop.CURRENT_TYPE` is what the stock Bip 6 face uses. It is not in the
`@zos/ui` typings, so guard it. (The docs mention `prop.CURRENT_CONFIG` — that
belongs to the pointer-style editor, a different widget.)

**The part the widget does not do.** It swaps *only the background*. Every
other coloured asset — marker sprites, meter frames, digit glyphs, icons — and
every `color:` passed to a `TEXT` widget has to be picked from `themeId` by
your own code. That is why every asset in the stock package is suffixed
`_theme1` … `_theme7`.

So the order in `build()` is:

1. create the edit widget
2. read `CURRENT_TYPE`
3. build every other asset path with that id, and resolve text colours from a
   per-theme palette table

Practically: give the generator a `THEMES` table of palettes, emit one asset
folder per theme (`t1/…`, `t2/…`), and have `layout.js` export the palettes as
`0xrrggbb` ints plus path builders that take the theme id. Keep the
colour-independent assets (the AOD layer, the transparent hit areas) outside
the theme folders so they are generated once.

Note that a theme change only reaches your own widgets when the face reloads —
they were created with the previous theme's colours. That is exactly why
`preview` is a full render.

Budget before committing: everything colour-bearing multiplies. A face with 84
marker sprites, 42 meter frames and 13 digit glyphs costs ~140 assets per
theme; the stock seven-theme face ships 775.

**Sibling editors**, same shape: `WATCHFACE_EDIT_GROUP` (which metric a slot
shows), `WATCHFACE_EDIT_POINTER`, `WATCHFACE_EDIT_MASK`,
`WATCHFACE_EDIT_FG_MASK`.

---

## 6. Sensors and their semantics

```js
import { Time, Battery, Step, HeartRate, Distance, Stand,
         Calorie, Stress, Pai, Weather } from '@zos/sensor'
```

| Call | Returns | Trap |
| --- | --- | --- |
| `Time.getDay()` | 1–7 | **1 = Monday**, not Sunday |
| `Time.getMonth()` | 1–12 | 1 = January |
| `Distance.getCurrent()` | **metres** | divide by 1000 for km |
| `Stress.getCurrent()` | `{ value, time }` | an object, not a number |
| `Pai.getToday()` | earned since midnight | reads **0** most of the day |
| `Pai.getTotal()` | rolling 7-day score | this is what the watch's PAI screen shows |
| `HeartRate.getCurrent()` | 0 unless continuous HR is on | fall back to `getLast()` |
| `Weather` | forecast high/low only | **no current temperature** |

### Current temperature

`@zos/sensor` cannot give it. The only source is the watchface data binding,
which renders from an image font:

```js
createWidget(widget.TEXT_IMG, {
  x, y, w, h,
  type: data_type.WEATHER_CURRENT,
  font_array: ['temp/0.png', ..., 'temp/9.png'],
  unit_en: 'temp/deg.png', unit_sc: 'temp/deg.png', unit_tc: 'temp/deg.png',
  negative_image: 'temp/neg.png',
  invalid_image: 'temp/dash.png',
  h_space: 0, align_h: align.CENTER_H, align_v: align.CENTER_V,
})
```

Generate the glyphs at the same size and colour as the neighbouring text so it
blends in. Give the degree sign a narrower canvas than the digits or it floats
away from the number. Wrap the whole call in `try/catch` — one unavailable
binding should cost you a cell, not the screen.

Change listeners exist for the fast-moving ones and are worth registering:
`Step.onChange`, `HeartRate.onCurrentChange` / `onLastChange`,
`Battery.onChange`. Keep the handles and unhook in `onDestroy`.

---

## 7. Assets

### The reference package is not editable art

Files inside an extracted `.zab` have a `.png` extension but are Zepp's
internal format: header `2e 01 01 00 ...`, width/height as `uint16` at offsets
12 and 14, and the marker `SOMH` ("HMOS" little-endian) at 0x14. Do not try to
open or convert them. They are still useful for two things:

- `app.json` structure and platform ids
- `strings`-style extraction from `watchface/index.bin` reveals every widget
  type, option name and `data_type` the original face used — an authoritative
  list of what the firmware supports:

```js
const b = require('fs').readFileSync('watchface/index.bin')
let out = [], cur = ''
for (const c of b) { if (c >= 32 && c < 127) cur += String.fromCharCode(c)
                     else { if (cur.length >= 4) out.push(cur); cur = '' } }
console.log(out.join('\n'))
```

(Note the `>= 4` filter hides 3-character names like `CAL`.)

### Generate your own

Author SVG and rasterise with `@resvg/resvg-js` (prebuilt Windows binary, no
compiler needed). Install it under `tools/` with its own `package.json` so it
never enters the app bundle.

Two rasteriser quirks:

- **`hsl()` is not supported.** Convert to `#rrggbb` in JS.
- **Do not rely on `dominant-baseline`.** Derive the baseline instead: for a
  font with ~0.70 em cap height, the optical centre of digits and capitals sits
  `0.35 * fontSize` above the baseline. `y = centreY + size * 0.35`.

Fonts: point `fontFiles` at real files (`C:/Windows/Fonts/segoeui.ttf`,
`seguisb.ttf`, `segoeuib.ttf`) rather than relying on system matching.

### Bake the static layer

Draw everything that never changes — rings, tick labels, icons, tile
backgrounds, dividers, static captions — into a single `bg.png`. Only live
readings become widgets. A face with a dozen metrics then needs ~30 widgets
instead of ~100, redraws are cheap, and you get anti-aliasing and gradients
that `FILL_RECT` cannot produce.

### One source of truth

Put palette and geometry in a single `tools/design.cjs`. Have the generator
both draw the artwork **and emit `watchface/layout.js`** with the runtime
coordinates. Changing one number then moves the art and the widgets together;
no coordinate is ever written twice.

Add a `checkGeometry()` that throws during asset generation when an invariant
breaks (elements overlapping, something off-screen). A failed build beats a
broken watch.

### Sampling a palette from a mockup

Decode the mockup with `pngjs` and pick the most saturated pixel in a small
radius around each point of interest. Sampling the exact centre of a glyph
usually lands on background.

---

## 8. AOD

Tag widgets with `show_level` and keep both states in one file:

- normal: `0x1 | 0x4` (normal + edit/preview)
- AOD: `0x2`

Keep AOD sparse — few lit pixels. Since the daytime tiles are not drawn, the
AOD layer can use a different, larger geometry; just emit a separate position
table for it rather than reusing the daytime one.

---

## 9. Verifying without a watch

The single highest-leverage tool in this project. Build it early.

### 9.1 Offline runtime harness

Load `watchface/index.js` with the `@zos` modules stubbed, run the **real**
lifecycle, then rasterise every widget that was created. What you get is what
the device will draw.

- Rewrite the ES modules for `require` with a small regex transform
  (`import { a, b } from 'x'` → `const { a, b } = stub`, `export const` →
  `exports.`), then run through `new Function`.
- Capture `WatchFace(def)` from a global, then call `onInit()`, `build()`, the
  `onPerMinute` callbacks, `pause_call`, `resume_call`, and the poll timer.
- Render `IMG` as `<image href="data:...">`, `TEXT` honouring `align_h` /
  `align_v`, `FILL_RECT` as `<rect>`, and lay `TEXT_IMG` glyphs out by hand.

Assert, not just render:

- every `src` / `font_array` / `unit_*` file exists
- every widget is inside 390x450 (skip `WIDGET_DELEGATE`, it has no geometry)
- the markers are the last widgets created
- every hot-zone image is **fully transparent**
- exactly one poll timer survives a pause/resume cycle

Add environment switches so both branches get exercised:

```powershell
$env:SIM='{"steps":98765,"heartRate":0,"battery":3}'   # extreme readings
$env:SIM_BARE='1'   # strip IMG_CLICK, deleteWidget, prop.VISIBLE, data types
```

Extreme values catch the layout bugs: three-digit heart rates, five-digit step
counts, 100% battery pushing a unit label out of its tile.

### 9.2 Diff a device screenshot against expected

When something renders wrong on hardware and you cannot see why, composite what
*should* be there (`bg.png` plus the sprites at their computed positions) and
diff it against a screenshot at pixel level. Render three panels —
expected / device / difference — and print an ASCII map of the differing
region. This is what turned "the marker looks broken" into "the sprite is drawn
clipped to exactly its top-left 48x48", which is a solvable statement.

The simulator's Screenshot button writes to `~/Downloads/screenshot-HHMMSSmmm.png`
at full 390x450.

### 9.3 Capture the simulator window

`Graphics.CopyFromScreen` only captures what is visible. Use `PrintWindow` with
flag `2` (`PW_RENDERFULLCONTENT`) to grab the window even when it is behind
others, and find the handle by enumerating windows for the title
`Huami OS Simulator` — `FindWindow` with an exact title often misses it.

(In PowerShell 5.1, do not assign to `$pid`; it is read-only.)

---

## 10. Layout notes for 390 x 450

- Corner radius ~45 px. A point needs the corner check only when
  `x > 390 - R` **and** `y < R` (and the mirrored cases).
- Keep content inside roughly `x: 12..378`, `y: 20..432`.
- Tap targets: 68 px tall minimum reads comfortably; do not go below ~44.
- Body text 15 px, values 27–31 px, hero numbers 32–36 px.
- Verify against 00:00 and 12:30 when two rotating elements can align — that is
  when overlapping elements collide.
- To size text inside a circle, do not use the corner of its bounding box —
  round glyphs leave those corners empty. Render the candidate strings and
  measure the furthest lit pixel from the centre. Across all 100 two-digit
  pairs the one that reaches furthest is `07`, and the exact test buys about
  10% more type than the bounding-box estimate allows.
- Two rotating markers that carry numbers must be checked at the angle where
  they **align**, not just at a typical time. Once the outlines around them go
  away, adjacent digits read as one long number — `15` and `06` at 06:15
  becomes `1506`. Budget a real ink gap between them, not just
  non-overlapping bounding boxes.
- A round dial is bounded by whatever crowds it on **all four** sides, and it
  grows by twice what you free up on the tightest one. Work out the reach
  first (`min(edge - neighbour)` horizontally and vertically), then derive the
  radii from it, rather than picking radii and hoping they fit.

---

## 11. Order of work

1. Get `zeus status` green (login + simulator connected) and the emulator
   **started**, not just open.
2. Fix `app.json`: platforms, permissions, apiVersion, preview icon.
3. Write `tools/design.cjs` (palette, geometry) and the generator that emits
   both the PNGs and `layout.js`.
4. Write the face against `@zos/*` only. Log the API probe line at startup.
5. Build the offline harness before touching the device. Iterate on layout
   there — it is seconds per cycle instead of minutes.
6. `npm run dev`, then read `sim-debug.log`. Silence after
   `current filepath: /watchface/index.js` means it loaded cleanly.
7. For anything visual that is wrong on hardware, diff a screenshot rather than
   guessing.

## 12. Symptom index

| Symptom | Cause |
| --- | --- |
| Black screen, `cannot read property 'createSensor' of undefined` | legacy `hmSensor`; port to `@zos/sensor` |
| `cannot read property 'widget' of null` | dereferencing the absent `hmUI` global, usually via a bad `&&` guard |
| Build dies on `PARSE_ERROR` in a `.node` file | Rollup picked up a build script; rename it `.cjs` |
| Values freeze / skip while the screen is off | no `WIDGET_DELEGATE` `resume_call` |
| A reading scrolls sideways forever | `text_style.NONE` is the marquee; use `ELLIPSIS` and widen the box |
| A moved sprite is drawn partially | partial `MORE` patch and/or an update while the screen was off; re-create the widget |
| A bar never resizes | `MORE` cannot resize reliably; use a frame strip and swap `src` |
| Taps do nothing | `IMG_CLICK` given `click_func` instead of `type` |
| Tiles grew a visible box | `IMG_CLICK`'s `src` is permanent; make it transparent |
| PAI always 0 | `getToday()` instead of `getTotal()` |
| `.gitignore` keeps emptying | `zeus dev` rewrites it; mirror to `.git/info/exclude` |
