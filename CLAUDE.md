# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server at http://localhost:5173 (HMR)
npm run build    # production build → dist/
npm run preview  # serve dist/ locally
```

## Architecture

Single-page React + Vite app. Entry: `src/main.jsx` renders `<App>` directly (no floating global panel — the control panel is `<Panel>`, rendered by `App` as a docked sidebar card, not a portal/popover).

- **`src/App.jsx`** — canvas stage + halftone renderer. Calls `useDialKit(PANEL_ID, DIAL_CONFIG)` once (the only call in the app — see dialkit gotcha below) and passes the resolved `params` down to `<Panel>`.
- **`src/dialConfig.js`** — the `dialkit` schema (`PANEL_ID`, `DIAL_CONFIG`), single source of truth for every control's path, range and default.
- **`src/Panel.jsx`** — the sidebar UI: header, PROPERTIES/COLOR/EXPORT accordion sections, all custom-styled primitives (`Slider`, `SegmentedToggle`, `Select`, `TextInput`, shape buttons). Writes values via `DialStore.updateValue(realPanelId, path, value)`, resolving the real panel id through `DialStore.getPanels().find(p => p.name === PANEL_ID)` (see gotcha below).
- **`src/ColorPicker.jsx`** + **`src/colorUtils.js`** — a from-scratch HSV/HSL/RGB color picker popover (draggable saturation/value area, hue strip, HSL/RGB/HEX field modes, preset swatches) replacing the native `<input type="color">`. HSV is kept as local component state seeded once from the incoming hex, not re-derived every render — black/white/gray have no recoverable hue, so re-deriving snaps the hue slider back after every drag.

### `dialkit` gotcha

`useDialKit(name, config)` derives its real internal panel id as `${name}-${useId()}` — unique per call, even with the same `name`. Calling it more than once anywhere in the app silently creates a second, disconnected panel; writes against the raw `name` then hit nothing (`DialStore.updateValue` no-ops on an unknown id). Keep the single `useDialKit` call in `App.jsx`; anything else that needs to write values does so through `DialStore.getPanels().find(...)`.

### `drawHalftone(canvas, img, params)` — pipeline

1. `getContain(imgW, imgH, ratio)` → `[outW, outH, imgX, imgY]`. Fits the source image inside the target aspect ratio with padding (contain mode, NOT crop). The padded area is filled white (or black if `invert=true`).
2. Compose padded canvas: fill bg, draw source centered
3. Apply zoom/pan: sample sub-region of padded canvas
4. Brightness pass: precompute per-cell luminance on rotated grid
5. Render pass: per-pixel, decide inside/outside the mark

**Mark size — shared by all 4 shapes** (`dots`, `squares`, `diamond`, `bars`):
```js
const minHW = cell * (0.02 + (contrast / 200) * 0.06)   // floor (bright areas)
const imgHW = Math.max(minHW, (maxMark / 2) * t)          // ceiling (dark areas)
```
`Math.max` (not `+`) keeps contrast and spread fully independent:
- Dark areas (t≈1): the spread-driven term dominates → spread controls
- Bright areas (t≈0): `minHW` dominates → contrast controls, and marks never fully disappear

`maxMark = cell * (0.1 + (spread / 100) * 1.9)`. `dots` uses `imgHW` as a radius, `squares` as a half-side, `diamond` as an L1-norm half-width (`|lx|+|ly| <= imgHW`, i.e. a rhombus), `bars` as a half-width (unbounded vertically — the "líneas continuas" default).

A different shape also called `lines` (same icon glyph as the current `diamond`) used to exist but was geometrically identical to `bars` minus spread/contrast support, so it was removed as a redundant, less-capable duplicate — then the Figma spec re-added a diamond button, this time as a genuinely distinct mark (the L1-norm formula above), not a revival of the old `lines` stripe. A `triangle` shape was also drafted in the UI at one point but never got a render branch; it was dropped rather than silently falling back to the `bars` formula.

### Controls (`dialConfig.js`)

| Path | Range/type | Role |
|---|---|---|
| `Properties.shape` | select: `bars`/`dots`/`squares`/`diamond` | Mark shape |
| `Properties.dotSize` | 5–60 | Grid cell size (px) |
| `Properties.angle` | 0–90 | Grid rotation in degrees |
| `Properties.contrast` | 50–200 | Mark-size floor in bright areas (see above) |
| `Properties.spread` | 0–100 | Mark-size ceiling in dark areas |
| `Color.barColor` / `Color.barColorSet` | color / bool | Main ink color; `barColorSet` gates the swatch's idle-vs-selected look (starts idle until first pick) |
| `Color.secondaryEnabled` | bool | Enables the secondary tint (reveals its picker + amount slider) |
| `Color.secondaryColor` / `Color.secondaryAmount` | color / 0–100 | Secondary tint color and luminance threshold below which it replaces the main ink |
| `Color.bgTransparent` | bool | `false` reveals the background color picker; `true` = no background paint |
| `Color.bgColor` | color | Background color |
| `Color.invert` | bool | Flips the bright↔dark → mark-size mapping (and the padding fill color) |
| `Output.outputRatio` | select | Output aspect ratio (contain, not crop) |
| `Output.exportFormat` | select: GIF/PNG | Export format |
| `Output.filename` | text | Export filename |

### Canvas interactivity

- **Scroll wheel**: zoom centered on cursor (min 1×, max 20×), non-passive listener
- **Drag**: pan with offset clamping
- **Double-click**: reset zoom/pan to default
- Export captures exactly the current zoomed/panned view

### Reference

The visual target is efecto.app's "Mono Halftone" effect. Key behaviors to match (verified against `efecto.app/fx` directly):
- Marks never fully disappear at contrast>0, for every shape, not just the dash/bars default
- Aspect ratio change uses contain (padding), not crop
- `angle=0` in this app = vertical lines (equivalent to angle=90 in efecto.app)
