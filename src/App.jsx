import { useRef, useEffect, useState, useCallback } from 'react'
import { useDialKit } from 'dialkit'
import Panel from './Panel.jsx'
import { PANEL_ID, EFFECTS, HALFTONE_CONFIG, ASCII_CONFIG } from './dialConfig.js'
import { parseGIF, decompressFrames } from 'gifuct-js'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

// ── Colour helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function getContain(imgW, imgH, ratio) {
  if (ratio === 'source') return [imgW, imgH, 0, 0]
  const [rW, rH] = ratio.split(':').map(Number)
  const tR = rW / rH, sR = imgW / imgH
  if (sR > tR) {
    const outH = Math.round(imgW / tR)
    return [imgW, outH, 0, Math.round((outH - imgH) / 2)]
  } else {
    const outW = Math.round(imgH * tR)
    return [outW, imgH, Math.round((outW - imgW) / 2), 0]
  }
}

// ── GIF frame extractor ────────────────────────────────────────────────────────

async function extractGifFrames(file) {
  const buffer = await file.arrayBuffer()
  const gif = parseGIF(buffer)
  const frames = decompressFrames(gif, true)
  const W = gif.lsd.width, H = gif.lsd.height

  const composite = document.createElement('canvas')
  composite.width = W; composite.height = H
  const ctx = composite.getContext('2d')
  const saved = document.createElement('canvas')
  saved.width = W; saved.height = H
  const result = []

  for (const frame of frames) {
    const { dims, patch, delay, disposalType } = frame
    if (disposalType === 3) {
      const sCtx = saved.getContext('2d')
      sCtx.clearRect(0, 0, W, H)
      sCtx.drawImage(composite, 0, 0)
    }
    const pCanvas = document.createElement('canvas')
    pCanvas.width = dims.width; pCanvas.height = dims.height
    pCanvas.getContext('2d').putImageData(
      new ImageData(
        patch instanceof Uint8ClampedArray ? patch : new Uint8ClampedArray(patch.buffer),
        dims.width, dims.height
      ), 0, 0
    )
    ctx.drawImage(pCanvas, dims.left, dims.top)
    const snap = document.createElement('canvas')
    snap.width = W; snap.height = H
    snap.getContext('2d').drawImage(composite, 0, 0)
    result.push({ canvas: snap, delay: Math.max(20, (delay || 10) * 10) })
    if (disposalType === 2) ctx.clearRect(dims.left, dims.top, dims.width, dims.height)
    else if (disposalType === 3) { ctx.clearRect(0, 0, W, H); ctx.drawImage(saved, 0, 0) }
  }
  return result
}

// ── Shared source prep ───────────────────────────────────────────────────────
// Fits the image into the output ratio (padded, not cropped), then samples the
// zoomed/panned sub-region. Shared by every effect's renderer.

function prepareSource(img, { outputRatio, invert, zoom, offset }) {
  const imgW = img.naturalWidth  ?? img.width
  const imgH = img.naturalHeight ?? img.height
  const [W, H, imgX, imgY] = getContain(imgW, imgH, outputRatio)

  const padded = document.createElement('canvas')
  padded.width = W; padded.height = H
  const pctx = padded.getContext('2d')
  pctx.fillStyle = invert ? '#000000' : '#ffffff'
  pctx.fillRect(0, 0, W, H)
  pctx.drawImage(img, imgX, imgY, imgW, imgH)

  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const octx = off.getContext('2d')
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  const srcW = W / zoom, srcH = H / zoom
  const srcX = W / 2 - (W / 2 + offset.x) / zoom
  const srcY = H / 2 - (H / 2 + offset.y) / zoom
  octx.drawImage(padded, srcX, srcY, srcW, srcH, 0, 0, W, H)

  const { data } = octx.getImageData(0, 0, W, H)
  return { W, H, data }
}

// ── Halftone renderer ──────────────────────────────────────────────────────────

function drawHalftone(canvas, img, {
  dotSize, spread, contrast, angle, shape, invert,
  barColor, bgColor, bgTransparent, secondaryColor, secondaryAmount,
  outputRatio, zoom, offset,
}) {
  const { W, H, data: src } = prepareSource(img, { outputRatio, invert, zoom, offset })
  const cell    = Math.max(1, Math.round(dotSize))
  const halfW   = W / 2, halfH = H / 2
  const rad     = angle * Math.PI / 180
  const cosA    = Math.cos(rad), sinA = Math.sin(rad)
  const maxMark = cell * (0.1 + (spread / 100) * 1.9)

  const halfDiag = Math.ceil(Math.sqrt(W * W + H * H) / 2) + cell
  const steps    = Math.ceil(halfDiag / cell)
  const gSize    = 2 * steps + 1
  const luminance = new Float32Array(gSize * gSize)

  for (let ci = 0; ci < gSize; ci++) {
    for (let ri = 0; ri < gSize; ri++) {
      const c = ci - steps, r = ri - steps
      const cx = (c + 0.5) * cell, cy = (r + 0.5) * cell
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

  const inkRgb   = hexToRgb(barColor)
  const secondaryRgb = secondaryColor ? hexToRgb(secondaryColor) : null
  const bg       = hexToRgb(bgColor)
  const threshold = secondaryRgb ? secondaryAmount / 100 : 0

  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(W, H)
  const dst = out.data

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - halfW, dy = y - halfH
      const rx = dx * cosA + dy * sinA
      const ry = -dx * sinA + dy * cosA
      const c  = Math.floor(rx / cell), r = Math.floor(ry / cell)
      const ci = c + steps, ri = r + steps
      const lx = rx - (c + 0.5) * cell
      const ly = ry - (r + 0.5) * cell

      const bright = (ci >= 0 && ci < gSize && ri >= 0 && ri < gSize)
        ? luminance[ri * gSize + ci] : 0.5
      const t = invert ? bright : 1 - bright

      const minHW = cell * (0.02 + (contrast / 200) * 0.06)
      const imgHW = Math.max(minHW, (maxMark / 2) * t)

      let inside = false
      if (shape === 'dots') {
        inside = lx * lx + ly * ly <= imgHW * imgHW
      } else if (shape === 'squares') {
        inside = Math.abs(lx) <= imgHW && Math.abs(ly) <= imgHW
      } else if (shape === 'diamond') {
        inside = Math.abs(lx) + Math.abs(ly) <= imgHW
      } else {
        inside = Math.abs(lx) <= imgHW
      }

      const oi = (y * W + x) * 4
      const color = inside
        ? (threshold > 0 && t < threshold ? secondaryRgb : inkRgb)
        : bg
      dst[oi]     = color[0]
      dst[oi + 1] = color[1]
      dst[oi + 2] = color[2]
      dst[oi + 3] = (!inside && bgTransparent) ? 0 : 255
    }
  }
  ctx.putImageData(out, 0, 0)
}

// ── ASCII renderer ───────────────────────────────────────────────────────────
// Real monospace characters (not the shader bit-pattern trick some tools use):
// each cell's average brightness picks a character from a dark→light ramp.

const DEFAULT_ASCII_RAMP = '@%#*+=-:. '

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function drawAscii(canvas, img, {
  cellSize, characterRotation, charRamp, invert,
  barColor, bgColor, bgTransparent, secondaryColor, secondaryAmount,
  outputRatio, zoom, offset,
}) {
  const ramp = charRamp && charRamp.length > 0 ? charRamp : DEFAULT_ASCII_RAMP
  const { W, H, data: src } = prepareSource(img, { outputRatio, invert, zoom, offset })
  const cell = Math.max(4, Math.round(cellSize))

  const inkRgb = hexToRgb(barColor)
  const secondaryRgb = secondaryColor ? hexToRgb(secondaryColor) : null
  const bgRgb = hexToRgb(bgColor)
  const threshold = secondaryRgb ? secondaryAmount / 100 : 0

  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (bgTransparent) ctx.clearRect(0, 0, W, H)
  else {
    ctx.fillStyle = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`
    ctx.fillRect(0, 0, W, H)
  }
  ctx.font = `${cell}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let cy = 0; cy < H; cy += cell) {
    for (let cx = 0; cx < W; cx += cell) {
      const x1 = Math.min(W, cx + cell), y1 = Math.min(H, cy + cell)
      let sum = 0, n = 0
      for (let py = cy; py < y1; py++) {
        for (let px = cx; px < x1; px++) {
          const i = (py * W + px) * 4
          sum += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
          n++
        }
      }
      if (n === 0) continue
      const brightness = sum / n / 255
      const t = invert ? brightness : 1 - brightness
      const char = ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]
      if (char === ' ') continue

      const px = cx + cell / 2, py = cy + cell / 2
      ctx.save()
      ctx.translate(px, py)
      if (characterRotation) ctx.rotate((Math.floor(hash2(cx, cy) * 4) * Math.PI) / 2)
      const color = (threshold > 0 && t < threshold) ? secondaryRgb : inkRgb
      ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
      ctx.fillText(char, 0, 0)
      ctx.restore()
    }
  }
}

function drawGifFrame(canvas, frameCanvas, zoom, offset) {
  const W = frameCanvas.width, H = frameCanvas.height
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
  const ctx = canvas.getContext('2d')
  const sW = W / zoom, sH = H / zoom
  const sX = W / 2 - (W / 2 + offset.x) / zoom
  const sY = H / 2 - (H / 2 + offset.y) / zoom
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(frameCanvas, sX, sY, sW, sH, 0, 0, W, H)
}

async function encodeGif(frames, filename) {
  const gif = GIFEncoder()
  for (const { canvas, delay } of frames) {
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    const palette = quantize(data, 256)
    const index   = applyPalette(data, palette)
    gif.writeFrame(index, width, height, { palette, delay: Math.round(delay / 10) })
  }
  gif.finish()
  const blob = new Blob([gif.bytes()], { type: 'image/gif' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.download = `${filename}.gif`; a.href = url; a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef = useRef(null)
  const imgRef    = useRef(null)
  const stageRef  = useRef(null)
  const dragRef   = useRef({ active: false, startX: 0, startY: 0, startOffset: { x: 0, y: 0 } })

  const rawFramesRef      = useRef(null)
  const renderedFramesRef = useRef(null)
  const animRef           = useRef(null)
  const animStateRef      = useRef({ frameIndex: 0, nextFrameTime: 0 })
  const zoomRef           = useRef(1)
  const offsetRef         = useRef({ x: 0, y: 0 })
  const renderIdRef       = useRef(0)
  const animateRef        = useRef(true)
  const isGifRef          = useRef(false)

  // Canvas state
  const [hasImage,    setHasImage]    = useState(false)
  const [isDragging,  setIsDragging]  = useState(false)
  const [isPanning,   setIsPanning]   = useState(false)
  const [zoom,        setZoom]        = useState(1)
  const [offset,      setOffset]      = useState({ x: 0, y: 0 })
  const [isGif,       setIsGif]       = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  useEffect(() => { isGifRef.current = isGif }, [isGif])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { offsetRef.current = offset }, [offset])

  const [effect, setEffect] = useState(EFFECTS[0])
  const isAscii = effect === 'ASCII'
  const params = useDialKit(PANEL_ID, isAscii ? ASCII_CONFIG : HALFTONE_CONFIG)

  const drawEffect = isAscii ? drawAscii : drawHalftone

  // Unified params snapshot for render calls
  const renderParams = useCallback(() => ({
    ...(isAscii
      ? { cellSize: params.Properties.cellSize, characterRotation: params.Properties.characterRotation, charRamp: params.Properties.charRamp }
      : { dotSize: params.Properties.dotSize, spread: params.Properties.spread, contrast: params.Properties.contrast, angle: params.Properties.angle, shape: params.Properties.shape }
    ),
    invert:        params.Color.invert,
    barColor:      params.Color.barColor,
    bgColor:       params.Color.bgColor,
    bgTransparent: params.Color.bgTransparent,
    secondaryColor:    params.Color.secondaryEnabled ? params.Color.secondaryColor : null,
    secondaryAmount:   params.Color.secondaryAmount,
    outputRatio:   params.Output.outputRatio,
  }), [
    isAscii,
    params.Properties.cellSize, params.Properties.characterRotation, params.Properties.charRamp,
    params.Properties.dotSize, params.Properties.spread, params.Properties.contrast,
    params.Properties.angle, params.Properties.shape,
    params.Color.invert, params.Color.barColor, params.Color.bgColor,
    params.Color.bgTransparent, params.Color.secondaryEnabled,
    params.Color.secondaryColor, params.Color.secondaryAmount,
    params.Output.outputRatio,
  ])

  // ── GIF animation loop ──────────────────────────────────────────────────────

  function stopAnimation() {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
  }

  function startAnimation() {
    stopAnimation()
    const frames = renderedFramesRef.current
    if (!frames || frames.length === 0) return
    animStateRef.current = { frameIndex: 0, nextFrameTime: performance.now() + frames[0].delay }
    function tick() {
      const rendered = renderedFramesRef.current
      if (!rendered || rendered.length === 0) return
      const now = performance.now(), state = animStateRef.current
      if (now >= state.nextFrameTime) {
        const next = (state.frameIndex + 1) % rendered.length
        state.nextFrameTime = now + rendered[next].delay
        state.frameIndex = next
      }
      const frame = rendered[state.frameIndex]
      const canvas = canvasRef.current
      if (canvas && frame) drawGifFrame(canvas, frame.canvas, zoomRef.current, offsetRef.current)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
  }

  // ── Static image redraw ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasImage || isGif || !imgRef.current || !canvasRef.current) return
    drawEffect(canvasRef.current, imgRef.current, { ...renderParams(), zoom, offset })
  }, [hasImage, isGif, zoom, offset, renderParams, drawEffect])

  // ── GIF re-render on param change ──────────────────────────────────────────
  useEffect(() => {
    if (!hasImage || !isGif) return
    const raw = rawFramesRef.current
    if (!raw || raw.length === 0) return

    const id = ++renderIdRef.current
    stopAnimation()
    renderedFramesRef.current = []
    setIsRendering(true)
    const currentParams = { ...renderParams(), zoom: 1, offset: { x: 0, y: 0 } }

    ;(async () => {
      const rendered = renderedFramesRef.current
      let started = false
      for (let i = 0; i < raw.length; i++) {
        if (renderIdRef.current !== id) return
        const { canvas: rawCanvas, delay } = raw[i]
        const outCanvas = document.createElement('canvas')
        drawEffect(outCanvas, rawCanvas, currentParams)
        rendered.push({ canvas: outCanvas, delay })
        if (!started) {
          started = true
          setIsRendering(false)
          if (animateRef.current) startAnimation()
          else {
            const canvas = canvasRef.current
            if (canvas) drawGifFrame(canvas, outCanvas, zoomRef.current, offsetRef.current)
          }
        }
        if (i % 4 === 3) await new Promise(r => setTimeout(r, 0))
      }
      if (renderIdRef.current !== id) return
      if (animateRef.current) startAnimation()
    })()
  }, [hasImage, isGif, renderParams, drawEffect])

  // ── Animate toggle ──────────────────────────────────────────────────────────
  useEffect(() => {
    animateRef.current = params.Output.animate
    if (!isGif || !hasImage) return
    const rendered = renderedFramesRef.current
    if (!rendered || rendered.length === 0) return
    if (params.Output.animate) {
      startAnimation()
    } else {
      stopAnimation()
      const frame = rendered[animStateRef.current.frameIndex] ?? rendered[0]
      const canvas = canvasRef.current
      if (canvas && frame) drawGifFrame(canvas, frame.canvas, zoomRef.current, offsetRef.current)
    }
  }, [params.Output.animate, isGif, hasImage])

  useEffect(() => {
    if (!isGif || params.Output.animate) return
    const rendered = renderedFramesRef.current
    if (!rendered || rendered.length === 0) return
    const frame = rendered[animStateRef.current.frameIndex] ?? rendered[0]
    const canvas = canvasRef.current
    if (canvas && frame) drawGifFrame(canvas, frame.canvas, zoom, offset)
  }, [isGif, params.Output.animate, zoom, offset])

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!hasImage) return
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas || canvas.width === 0) return
      const rect = canvas.getBoundingClientRect()
      const mx = (e.clientX - rect.left  - rect.width  / 2) * (canvas.width  / rect.width)
      const my = (e.clientY - rect.top   - rect.height / 2) * (canvas.height / rect.height)
      const cW = canvas.width, cH = canvas.height
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setZoom(prevZoom => {
        const newZoom = Math.max(1, Math.min(20, prevZoom * factor))
        setOffset(prevOff => {
          const r = newZoom / prevZoom
          const nx = mx * (1 - r) + prevOff.x * r
          const ny = my * (1 - r) + prevOff.y * r
          const maxX = cW * (newZoom - 1) / 2
          const maxY = cH * (newZoom - 1) / 2
          return { x: Math.max(-maxX, Math.min(maxX, nx)), y: Math.max(-maxY, Math.min(maxY, ny)) }
        })
        return newZoom
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasImage])

  // ── Pan ─────────────────────────────────────────────────────────────────────
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

  // ── Image load / clear ───────────────────────────────────────────────────────
  function clearImage() {
    stopAnimation()
    renderIdRef.current++
    imgRef.current = null
    rawFramesRef.current = null
    renderedFramesRef.current = null
    setHasImage(false); setIsGif(false); setIsRendering(false)
    setZoom(1); setOffset({ x: 0, y: 0 })
    const canvas = canvasRef.current
    if (canvas) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); canvas.width = 0; canvas.height = 0 }
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    clearImage()
    if (file.type === 'image/gif') {
      extractGifFrames(file).then(frames => {
        rawFramesRef.current = frames
        setIsGif(true); setHasImage(true)
      })
    } else {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => { imgRef.current = img; URL.revokeObjectURL(url); setZoom(1); setOffset({ x: 0, y: 0 }); setHasImage(true) }
      img.src = url
    }
  }

  function handleExport() {
    if (!hasImage) return
    const name = (params.Output.filename || 'halftone').trim() || 'halftone'
    if (isGifRef.current && params.Output.exportFormat === 'GIF') {
      const rendered = renderedFramesRef.current
      if (!rendered || rendered.length === 0) return
      encodeGif(rendered, name)
    } else {
      const canvas = canvasRef.current
      if (!canvas) return
      const a = document.createElement('a')
      a.download = `${name}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
  }

  const stageClass = ['stage', isDragging && 'dragging', hasImage && 'has-image', isPanning && 'panning'].filter(Boolean).join(' ')

  return (
    <div className="app">
      <Panel
        params={params} onExport={handleExport} canExport={hasImage}
        effect={effect} onEffectChange={setEffect}
      />

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

        {isRendering && (
          <div className="rendering-overlay"><span>Procesando GIF…</span></div>
        )}

        {hasImage && (
          <button className="clear-btn" onClick={clearImage} title="Eliminar imagen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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
            <p>Arrastra una imagen aquí</p>
          </div>
        )}
      </div>
    </div>
  )
}
