# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server at http://localhost:5173 (HMR)
npm run build    # production build → dist/
npm run preview  # serve dist/ locally
```

## Architecture

Single-page React + Vite app. Entry: `src/main.jsx` mounts `<DialRoot>` (the floating control panel, top-right) globally, then renders `<App>`.

### `src/App.jsx`

**`getContain(imgW, imgH, ratio)`** — returns `[outW, outH, imgX, imgY]`. Fits the source image inside the target aspect ratio with padding (contain mode, NOT crop). The padded area is filled white (or black if invert=true).

**`drawHalftone(canvas, img, params)`** — pipeline:
1. `getContain` → output dimensions + image offset
2. Compose padded canvas: fill bg, draw source centered
3. Apply zoom/pan: sample sub-region of padded canvas
4. Brightness pass: precompute per-cell luminance on rotated grid
5. Render pass: per-pixel, decide inside/outside the mark

**Bars shape (líneas continuas)** — the key shape:
```js
const minHW = cell * (0.02 + (contrast / 200) * 0.06)  // background layer
const imgHW = (maxMark / 2) * t                          // image layer
inside = Math.abs(lx) <= Math.max(minHW, imgHW)
```
`Math.max` (not `+`) keeps contrast and spread fully independent:
- Dark areas (t≈1): imgHW dominates → spread controls
- Bright areas (t≈0): minHW dominates → contrast controls

`maxMark = cell * (0.1 + (spread / 100) * 1.9)`

### Controls (dialkit)

| Control | Range | Role |
|---|---|---|
| `dotSize` | 5–60 | Grid cell size (line spacing in px) |
| `spread` | 0–100 | Max width of image lines (dark areas) |
| `contrast` | 50–200 | Width of background lines (bright areas) |
| `angle` | 0–90 | Grid rotation in degrees |
| `shape` | bars/lines/dots/squares | Mark shape |
| `barColor`, `color2–4` | color | Mark colors |
| `bgColor` | color | Background color |
| `bgTransparent` | bool | Transparent bg on export |
| `colorCount` | 1–4 | Active colors |
| `invert` | bool | Flip bright↔dark mapping |
| `outputRatio` | select | Output aspect ratio (contain, not crop) |
| `filename` | text | Export PNG filename |
| `export` | action | Downloads canvas as PNG |

### Canvas interactivity

- **Scroll wheel**: zoom centered on cursor (min 1×, max 20×), non-passive listener
- **Drag**: pan with offset clamping
- **Double-click**: reset zoom/pan to default
- Export captures exactly the current zoomed/panned view

### Reference

The visual target is efecto.app's "Mono Halftone" effect (dash shape). Key behaviors to match:
- Background lines always visible at any contrast value
- Contrast only affects background line thickness, not image lines
- Aspect ratio change uses contain (padding), not crop
- `angle=0` in this app = vertical lines (equivalent to angle=90 in efecto.app)

### What was removed / changed vs original

- `thickness` removed — bar width driven entirely by `spread`
- `getCrop` replaced by `getContain` — aspect ratio adds padding instead of cropping
- `angle` range changed to 0–90 (was -180 to 180)
- `spread` range 0–100 (normalized internally)
- `contrast` range 50–200 (normalized internally), controls background line thickness only
