export const PANEL_ID = 'Halftone'

export const EFFECTS = ['Halftone', 'ASCII']

const OUTPUT = {
  outputRatio:  { type: 'select', options: ['source','1:1','4:3','3:2','16:9','9:16','3:4','2:3'], default: 'source' },
  animate:      true,
  exportFormat: { type: 'select', options: ['GIF', 'PNG'], default: 'GIF' },
  filename:     { type: 'text', default: 'halftone' },
}

// Shared by both effects — same field paths, so dialkit preserves whichever
// value the user picked across an effect switch instead of resetting it.
// Defaults must therefore match between configs, or switching effects would
// silently discard one effect's "default" the first time the other is opened.
const COLOR = {
  barColor:        { type: 'color', default: '#000000' },
  barColorSet:     false,
  secondaryEnabled: false,
  secondaryColor:   { type: 'color', default: '#2563eb' },
  secondaryAmount:  [0, 0, 100, 1],
  bgTransparent:   false,
  bgColor:         { type: 'color', default: '#F0F4F8' },
  invert:          false,
}

export const HALFTONE_CONFIG = {
  Properties: {
    shape:    { type: 'select', options: ['bars', 'dots', 'squares', 'diamond'], default: 'bars' },
    dotSize:  [10,  5,   60,  1],
    angle:    [0,   0,   90,  1],
    contrast: [100, 50, 200,  1],
    spread:   [90,  0,  100,  1],
  },
  Color: COLOR,
  Output: OUTPUT,
}

export const ASCII_CONFIG = {
  Properties: {
    cellSize:          [16, 6, 40, 1],
    characterRotation: false,
  },
  Color: COLOR,
  Output: OUTPUT,
}
