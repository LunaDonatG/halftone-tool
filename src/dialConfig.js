export const PANEL_ID = 'Halftone'

export const DIAL_CONFIG = {
  Properties: {
    shape:    { type: 'select', options: ['bars', 'lines', 'dots', 'squares'], default: 'bars' },
    dotSize:  [10,  5,   60,  1],
    angle:    [0,   0,   90,  1],
    contrast: [100, 50, 200,  1],
    spread:   [90,  0,  100,  1],
  },
  Color: {
    barColor:        { type: 'color', default: '#000000' },
    secondaryEnabled: false,
    secondaryColor:   { type: 'color', default: '#2563eb' },
    secondaryAmount:  [0, 0, 100, 1],
    bgTransparent:   false,
    bgColor:         { type: 'color', default: '#F0F4F8' },
    invert:          false,
  },
  Output: {
    outputRatio:  { type: 'select', options: ['source','1:1','4:3','3:2','16:9','9:16','3:4','2:3'], default: 'source' },
    animate:      true,
    exportFormat: { type: 'select', options: ['GIF', 'PNG'], default: 'GIF' },
    filename:     { type: 'text', default: 'halftone' },
  },
}
