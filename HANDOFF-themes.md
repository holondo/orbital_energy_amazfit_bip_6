# Handoff — add colour themes to the Orbit Energy watchface

Paste this whole file to the agent taking over.

---

## Your task

Add the stock **editable-watchface** experience to this project: the pencil icon
on the watch's watchface list opens an editor where the user cycles through
colour themes (pink / beige / grey / etc.), and the choice sticks.

The watchface is finished and working — this is purely a themes pass. **Do not
change the layout, the geometry, or any behaviour.** Every theme must be the
same face in different colours.

## Read this first

**`.claude/skills/amazfit-bip6-watchface/SKILL.md`** — the project's skill file.
Read all of it before writing code; it is short and every section is something
that cost a debugging round to learn.

- **§5 "Themes — the editable watchface"** is your specification. It has the
  `WATCHFACE_EDIT_BG` contract, the exact `bg_config` shape, how to read the
  selection back, and what the widget does *not* do.
- **§3 "Firmware behaviour you cannot get from the docs"** — five traps. §3.2
  (`text_style.NONE` is a marquee) and §3.3 (partial `setProperty` patches)
  will bite you if you touch the runtime.
- **§9 "Verifying without a watch"** — the offline harness. Use it constantly;
  a cycle there is seconds, on the device it is minutes.

`README.md` covers the geometry and the reasoning behind the current numbers.

---

## Where things stand

Single theme, 149 generated assets, everything driven from one design table.

```
tools/design.cjs        palette `C`, ring geometry, SLOTS table, icon paths
tools/build-assets.cjs  draws SVG -> rasterises to PNG -> emits watchface/layout.js
tools/simulate.cjs      offline harness: runs the real watchface, rasterises, asserts
tools/measure-text.cjs  measures text ink in a device screenshot
tools/fonts/            Instrument Serif (SIL OFL) — the marker digits' face
tools/diff-device.cjs   diffs expected vs a device screenshot
watchface/index.js      the face (@zos/ui, @zos/sensor, @zos/router, @zos/timer)
watchface/layout.js     GENERATED — coordinates, colours as ints, asset paths
assets/default/         GENERATED — never edit by hand
```

Commands: `npm run assets` (regenerate), `npm run build` (`dist/*.zab`),
`npm run dev` (push to a running simulator).

### What is colour-bearing today

| Asset | Count | Theme-dependent? |
| --- | --- | --- |
| `bg.png` | 1 | **yes** — rings, tiles, pill, icons, labels |
| `preview.png` / `icon.png` | 2 | **yes** — full-face render |
| `hl/h00…h23`, `hl/m00…m59` | 84 | **yes** — the orbital markers (set in Instrument Serif) |
| `meter/hr/00…20`, `meter/battery/00…20` | 42 | **yes** — HR bar, battery wave |
| `temp/0…9`, `deg`, `neg`, `dash` | 13 | **yes** — image font for temperature |
| `hl/aod_h`, `hl/aod_m`, `aod.png` | 3 | no — AOD is dim grey |
| `hit/*.png` | 4 | no — fully transparent |

**~142 assets per theme.** Four themes ≈ 570 files, seven ≈ 1000. The stock
seven-theme face ships 775, so this is normal, but check the `.zab` size and
`npm run assets` runtime as you go.

Runtime colours come from `layout.js`: `COLOR` (5 entries) plus a resolved
`color` int inside every `SLOTS[].value` / `SLOTS[].unit`.

---

## What to build

### 1. `tools/design.cjs` — a `THEMES` table

`C` is a flat palette object with these keys:

```
bg pink magenta cyan cyanDim blue sky violet white label
chip tileBg tileEdge pillBg pillEdge pillDiv barTrack
aodDim aodFaint aodText
```

Turn it into `THEMES = [{ id, key, name, C: {...} }]` where every entry has the
full key set. **Theme 1 must be byte-identical to today's output** — verify by
diffing the regenerated `assets/default/t1/bg.png` against a copy of the
current `bg.png` before you touch anything else.

The ring colours are parametric, not literal — `ringHue()`, `hourColor()`,
`minuteLabelColor()` in `design.cjs` sweep hue with position. Give each theme
its own sweep parameters (centre hue, spread, saturation, lightness) rather
than hard-coding 24 colours.

`SLOTS[].iconColor` and `SLOTS[].value.color` currently hold literal `C.*`
values. Change them to **role names** (`'primary'`, `'accent'`, `'blue'`, …)
and resolve through the active theme's palette at draw time and in
`emitLayout()`.

### 2. `tools/build-assets.cjs` — loop over themes

There are ~32 `D.C.*` references. Thread the active palette through the
drawing functions as a parameter instead of reading the module-level `D.C`.

Emit one folder per theme and keep the shared assets outside:

```
assets/default/t1/bg.png  t1/preview.png  t1/hl/…  t1/meter/…  t1/temp/…
assets/default/aod.png  assets/default/hl/aod_h.png  assets/default/hit/…
```

In `emitLayout()`, export `THEMES` with palettes as `0xrrggbb` ints and path
builders that take the theme key:

```js
export const IMAGE = {
  bg: (t) => t + '/bg.png',
  hourHighlight: (t, h) => t + '/hl/h' + pad2(h) + '.png',
  meter: (t, name, step) => t + '/meter/' + name + '/' + pad2(step) + '.png',
  // …
}
```

Keep `checkGeometry()` and `checkMarkerFit()` running — they are the guard
rails against a geometry regression.

### 3. `app.json`

```json
"watchface": { "path": "watchface/index", "main": 1, "lockscreen": 1, "editable": 1 }
```

### 4. `watchface/index.js`

Order matters. In `buildNormal()`, replace the background `IMG` with the edit
widget **first**, then read the selection, then build everything else from it:

```js
const editBg = createWidget(widget.WATCHFACE_EDIT_BG, {
  edit_id: 103,
  x: 0, y: 0,
  bg_config: THEMES.map((t) => ({ id: t.id, path: t.key + '/bg.png', preview: t.key + '/preview.png' })),
  count: THEMES.length,
  default_id: 1,
  show_level: LV_NORMAL | LV_EDIT,
})

const themeId = editBg.getProperty(prop.CURRENT_TYPE) || 1
const theme = THEMES[themeId - 1] || THEMES[0]
```

Then every `src:` and every `color:` comes from `theme`. Log the resolved id at
startup next to the existing `orbit:` line so the simulator log tells you what
happened.

`prop.CURRENT_TYPE` is **not** in the `@zos/ui` typings but exists on device —
guard it, exactly as the code already guards `widget.IMG_CLICK`,
`deleteWidget` and `prop.VISIBLE`.

### 5. `tools/simulate.cjs`

Stub `widget.WATCHFACE_EDIT_BG` and `prop.CURRENT_TYPE`, and add a `SIM_THEME`
env var so you can render any theme offline. Extend the existing assertions:
every theme's asset set must be complete, and the four orbital markers must
still be the last widgets created.

---

## Traps specific to this task

1. **The widget only swaps the background.** Markers, meters, digit glyphs and
   every `TEXT` colour are yours to select. Missing one shows up as a pink
   element inside a beige theme.
2. **`preview` is a full-face render, not a thumbnail.** During editing the
   user sees that image, not your widgets — your widgets still carry the
   *previous* theme's colours until the face reloads. Both `path` and
   `preview` are 390×450 here.
3. **`count` and `default_id` are siblings of `bg_config`**, not fields inside
   it.
4. **`app.icon` is the preview thumbnail** for a watchface, and Zeus rescales
   it to 266 px wide. Point it at theme 1's full render.
5. **Do not touch `text_style`.** It is `ELLIPSIS` on purpose — `NONE` is the
   marquee. See skill §3.2.
6. **`zeus dev` overwrites `.gitignore`** on every run. Restore it afterwards;
   the same rules are mirrored in `.git/info/exclude`, which it leaves alone.
7. Keep `tools/*.cjs` as `.cjs`. The Zeus bundler treats every root `.js` as a
   bundle entry and dies on the rasteriser's native module.

---

## Definition of done

- [ ] `npm run assets` regenerates cleanly and reports the marker clearance and
      digit-fit lines
- [ ] Theme 1 is pixel-identical to the pre-change output
- [ ] `node tools/simulate.cjs 14 20 --aod` passes for **every** theme
      (`SIM_THEME=…`), with no missing assets and nothing off-screen
- [ ] `SIM_BARE=1 node tools/simulate.cjs 14 20` still passes — the fallback
      paths for the undocumented API members are intact
- [ ] `06:15` and `00:00` still render correctly (the two marker-alignment
      cases — see the README note on why)
- [ ] `npm run build` produces a `.zab`; note its size in your summary
- [ ] The pencil icon appears on the watch, cycling changes the preview, and
      the choice survives a reload
- [ ] `README.md` and skill §5 updated with what you actually found — in
      particular whether `prop.CURRENT_TYPE` returned what the docs imply

## Ask the user before starting

**How many themes and which colours.** They mentioned the stock face has pink,
beige and grey. Do not guess: the asset count and the palette work both scale
with the answer, and a wrong palette wastes a full regeneration.
