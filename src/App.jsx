import { useRef, useEffect, useState } from 'react'
import { useDialKit } from 'dialkit'

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Returns [outW, outH, imgX, imgY] — source centered inside padded output canvas.
function getContain(imgW, imgH, ratio) {
  if (ratio === 'source') return [imgW, imgH, 0, 0]
  const [rW, rH] = ratio.split(':').map(Number)
  const tR = rW / rH, sR = imgW / imgH
  if (sR > tR) {
    // source wider than target → pad top/bottom
    const outH = Math.round(imgW / tR)
    return [imgW, outH, 0, Math.round((outH - imgH) / 2)]
  } else {
    // source taller than target → pad left/right
    const outW = Math.round(imgH * tR)
    return [outW, imgH, Math.round((outW - imgW) / 2), 0]
  }
}

// ── Halftone renderer ─────────────────────────────────────────────────────────

function drawHalftone(canvas, img, {
  dotSize, spread,
  contrast, angle, shape, invert,
  colorCount, barColor, color2, color3, color4, bgColor, bgTransparent,
  outputRatio,
  zoom, offset,
}) {
  const imgW = img.naturalWidth
  const imgH = img.naturalHeight
  const [W, H, imgX, imgY] = getContain(imgW, imgH, outputRatio)

  // ── 1. Compose padded image (source centered on white canvas) ─────────────────
  const padded  = document.createElement('canvas')
  padded.width  = W; padded.height = H
  const pctx    = padded.getContext('2d')
  pctx.fillStyle = invert ? '#000000' : '#ffffff'
  pctx.fillRect(0, 0, W, H)
  pctx.drawImage(img, imgX, imgY, imgW, imgH)

  // ── 2. Apply zoom/pan viewport ────────────────────────────────────────────────
  const off  = document.createElement('canvas')
  off.width  = W; off.height = H
  const octx = off.getContext('2d')
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'

  const srcW = W / zoom
  const srcH = H / zoom
  const srcX = W / 2 - (W / 2 + offset.x) / zoom
  const srcY = H / 2 - (H / 2 + offset.y) / zoom
  octx.drawImage(padded, srcX, srcY, srcW, srcH, 0, 0, W, H)

  const { data: src } = octx.getImageData(0, 0, W, H)

  // ── Geometry constants ───────────────────────────────────────────────────────
  const cell     = Math.max(1, Math.round(dotSize))
  const halfW    = W / 2
  const halfH    = H / 2
  const rad      = angle * Math.PI / 180
  const cosA     = Math.cos(rad)
  const sinA     = Math.sin(rad)
  const maxMark = cell * (0.1 + (spread / 100) * 1.9)

  // ── 2. Brightness pass ───────────────────────────────────────────────────────
  const halfDiag  = Math.ceil(Math.sqrt(W * W + H * H) / 2) + cell
  const steps     = Math.ceil(halfDiag / cell)
  const gSize     = 2 * steps + 1
  const luminance = new Float32Array(gSize * gSize)

  for (let ci = 0; ci < gSize; ci++) {
    for (let ri = 0; ri < gSize; ri++) {
      const c  = ci - steps
      const r  = ri - steps
      const cx = (c + 0.5) * cell
      const cy = (r + 0.5) * cell
      const srcPX = halfW + cx * cosA - cy * sinA
      const srcPY = halfH + cx * sinA + cy * cosA
      const x0 = Math.max(0, Math.round(srcPX - cell / 2))
      const x1 = Math.min(W - 1, Math.round(srcPX + cell / 2))
      const y0 = Math.max(0, Math.round(srcPY - cell / 2))
      const y1 = Math.min(H - 1, Math.round(srcPY + cell / 2))
      let sum = 0, n = 0
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const i = (py * W + px) * 4
          sum += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
          n++
        }
      }
      luminance[ri * gSize + ci] = n > 0 ? sum / n / 255 : 0.5
    }
  }

  // ── 3. Render pass ───────────────────────────────────────────────────────────
  const n       = Math.max(1, Math.min(4, Math.round(colorCount)))
  const palette = [barColor, color2, color3, color4].slice(0, n).map(hexToRgb)
  const bg      = hexToRgb(bgColor)

  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(W, H)
  const dst = out.data

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - halfW
      const dy = y - halfH
      const rx = dx * cosA + dy * sinA
      const ry = -dx * sinA + dy * cosA
      const c  = Math.floor(rx / cell)
      const r  = Math.floor(ry / cell)
      const ci = c + steps
      const ri = r + steps
      const lx = rx - (c + 0.5) * cell
      const ly = ry - (r + 0.5) * cell

      const bright = (ci >= 0 && ci < gSize && ri >= 0 && ri < gSize)
        ? luminance[ri * gSize + ci] : 0.5
      const t = invert ? bright : 1 - bright

      let inside = false
      if (shape === 'dots') {
        const maxR = (maxMark / 2) * t
        inside = lx * lx + ly * ly <= maxR * maxR
      } else if (shape === 'squares') {
        const h = (maxMark / 2) * t
        inside = Math.abs(lx) <= h && Math.abs(ly) <= h
      } else if (shape === 'lines') {
        // thin vertical line, width = cell/8
        inside = Math.abs(lx) <= (cell / 8) * t
      } else {
        // bars: continuous lines, variable width
        // contrast controls minimum line width (thin background lines)
        // base of 10% ensures always visible; contrast adds up to 20% more
        const minHW  = cell * (0.02 + (contrast / 200) * 0.06)
        const imgHW  = (maxMark / 2) * t
        inside = Math.abs(lx) <= Math.max(minHW, imgHW)
      }

      const oi = (y * W + x) * 4
      const color = inside ? palette[Math.min(Math.floor((1 - t) * n), n - 1)] : bg
      dst[oi]     = color[0]
      dst[oi + 1] = color[1]
      dst[oi + 2] = color[2]
      dst[oi + 3] = (!inside && bgTransparent) ? 0 : 255
    }
  }

  ctx.putImageData(out, 0, 0)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)
  const stageRef   = useRef(null)
  const dragRef    = useRef({ active: false, startX: 0, startY: 0, startOffset: { x: 0, y: 0 } })

  const [hasImage,   setHasImage]   = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning,  setIsPanning]  = useState(false)
  const [zoom,       setZoom]       = useState(1)
  const [offset,     setOffset]     = useState({ x: 0, y: 0 })

  const params = useDialKit(
    'Halftone',
    {
      shape:         { type: 'select', options: ['bars', 'lines', 'dots', 'squares'], default: 'bars' },
      dotSize:       [10,   5,    60,   1   ],
      spread:        [90,   0,    100,  1   ],
      angle:         [0,    0,    90,   1   ],
      contrast:      [100,  50,   200,  1   ],
      invert:        false,
      colorCount:    [1,    1,    4,    1   ],
      barColor:      { type: 'color', default: '#A8B8CC' },
      color2:        { type: 'color', default: '#E07B54' },
      color3:        { type: 'color', default: '#4A90D9' },
      color4:        { type: 'color', default: '#6DBF82' },
      bgColor:       { type: 'color', default: '#F0F4F8' },
      bgTransparent: false,
      outputRatio:   { type: 'select', options: ['source','1:1','4:3','3:2','16:9','9:16','3:4','2:3'], default: 'source' },
      filename:      { type: 'text',   default: 'halftone' },
      export:        { type: 'action' },
    },
    {
      onAction: (action) => {
        if (action !== 'export') return
        const canvas = canvasRef.current
        if (!canvas) return
        const name = (params.filename || 'halftone').trim() || 'halftone'
        const a = document.createElement('a')
        a.download = `${name}.png`
        a.href = canvas.toDataURL('image/png')
        a.click()
      },
    }
  )

  // ── Redraw when params or viewport change ─────────────────────────────────────
  useEffect(() => {
    if (!hasImage || !imgRef.current || !canvasRef.current) return
    drawHalftone(canvasRef.current, imgRef.current, {
      dotSize:       params.dotSize,
      spread:        params.spread,
      contrast:      params.contrast,
      angle:         params.angle,
      shape:         params.shape,
      invert:        params.invert,
      colorCount:    params.colorCount,
      barColor:      params.barColor,
      color2:        params.color2,
      color3:        params.color3,
      color4:        params.color4,
      bgColor:       params.bgColor,
      bgTransparent: params.bgTransparent,
      outputRatio:   params.outputRatio,
      zoom,
      offset,
    })
  }, [
    hasImage, zoom, offset,
    params.dotSize, params.spread,
    params.contrast, params.angle, params.shape, params.invert,
    params.colorCount, params.barColor, params.color2, params.color3, params.color4,
    params.bgColor, params.bgTransparent, params.outputRatio,
  ])

  // ── Non-passive wheel listener (zoom centered on cursor) ──────────────────────
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!imgRef.current) return
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas || canvas.width === 0) return
      const rect  = canvas.getBoundingClientRect()
      const mx = (e.clientX - rect.left  - rect.width  / 2) * (canvas.width  / rect.width)
      const my = (e.clientY - rect.top   - rect.height / 2) * (canvas.height / rect.height)
      const cW = canvas.width, cH = canvas.height
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setZoom(prevZoom => {
        const newZoom = Math.max(1, Math.min(20, prevZoom * factor))
        setOffset(prevOff => {
          const r  = newZoom / prevZoom
          const nx = mx * (1 - r) + prevOff.x * r
          const ny = my * (1 - r) + prevOff.y * r
          const maxX = cW * (newZoom - 1) / 2
          const maxY = cH * (newZoom - 1) / 2
          return {
            x: Math.max(-maxX, Math.min(maxX, nx)),
            y: Math.max(-maxY, Math.min(maxY, ny)),
          }
        })
        return newZoom
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Pan handlers ──────────────────────────────────────────────────────────────
  function handleMouseDown(e) {
    if (!hasImage || e.button !== 0) return
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startOffset: { ...offset } }
    setIsPanning(true)
  }
  function handleMouseMove(e) {
    if (!dragRef.current.active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = (e.clientX - dragRef.current.startX) * (canvas.width  / rect.width)
    const dy = (e.clientY - dragRef.current.startY) * (canvas.height / rect.height)
    const nx = dragRef.current.startOffset.x + dx
    const ny = dragRef.current.startOffset.y + dy
    const maxX = canvas.width  * (zoom - 1) / 2
    const maxY = canvas.height * (zoom - 1) / 2
    setOffset({ x: Math.max(-maxX, Math.min(maxX, nx)), y: Math.max(-maxY, Math.min(maxY, ny)) })
  }
  function handleMouseUp() { dragRef.current.active = false; setIsPanning(false) }

  // ── Image load / clear ────────────────────────────────────────────────────────
  function clearImage() {
    imgRef.current = null; setHasImage(false); setZoom(1); setOffset({ x: 0, y: 0 })
    const canvas = canvasRef.current
    if (canvas) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); canvas.width = 0; canvas.height = 0 }
  }
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { imgRef.current = img; URL.revokeObjectURL(url); setZoom(1); setOffset({ x: 0, y: 0 }); setHasImage(true) }
    img.src = url
  }

  const stageClass = ['stage', isDragging && 'dragging', hasImage && 'has-image', isPanning && 'panning'].filter(Boolean).join(' ')

  return (
    <div
      ref={stageRef}
      className={stageClass}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); loadFile(e.dataTransfer.files[0]) }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}
    >
      <canvas ref={canvasRef} className="canvas" />

      {hasImage && (
        <button className="clear-btn" onClick={clearImage} title="Eliminar imagen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6"  y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {!hasImage && (
        <div className="placeholder">
          <svg className="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <p>Arrastra una imagen PNG o JPG aquí</p>
        </div>
      )}
    </div>
  )
}
