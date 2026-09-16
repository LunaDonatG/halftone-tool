import { useEffect, useRef, useState } from 'react'
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb } from './colorUtils.js'

const PRESETS = ['#0056ff', '#ff00b2', '#38cd33', '#ff7b00', '#d0def9', '#6f00ff', '#ffdd00']

function ColorArea({ hue, sat, val, onChange }) {
  const areaRef = useRef(null)

  const setFromEvent = e => {
    const rect = areaRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    onChange(x * 100, (1 - y) * 100)
  }

  const handlePointerDown = e => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromEvent(e)
  }
  const handlePointerMove = e => {
    if (e.buttons !== 1) return
    setFromEvent(e)
  }

  return (
    <div
      ref={areaRef}
      className="cp-area"
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue},100%,50%))` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <div className="cp-area-cursor" style={{ left: `${sat}%`, top: `${100 - val}%` }} />
    </div>
  )
}

function Field({ label, value, onCommit, suffix }) {
  const [draft, setDraft] = useState(String(Math.round(value)))
  useEffect(() => { setDraft(String(Math.round(value))) }, [value])
  return (
    <label className="cp-field">
      <input
        className="cp-field-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft)
          if (Number.isFinite(n)) onCommit(n)
          else setDraft(String(Math.round(value)))
        }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </label>
  )
}

function ColorSelector({ value, onChange }) {
  const [r, g, b] = hexToRgb(value)
  const { h, s, v } = rgbToHsv(r, g, b)
  const hsl = rgbToHsl(r, g, b)

  const setHsv = (nh, ns, nv) => onChange(rgbToHex(hsvToRgb(nh, ns, nv)))
  const setHsl = (nh, ns, nl) => onChange(rgbToHex(hslToRgb(nh, ns, nl)))

  return (
    <div className="cp-selector" onPointerDown={e => e.stopPropagation()}>
      <ColorArea hue={h} sat={s} val={v} onChange={(ns, nv) => setHsv(h, ns, nv)} />
      <div className="cp-fields">
        <Field label="H" value={hsl.h} onCommit={n => setHsl(n, hsl.s, hsl.l)} />
        <Field label="S" value={hsl.s} onCommit={n => setHsl(hsl.h, n, hsl.l)} />
        <Field label="L" value={hsl.l} onCommit={n => setHsl(hsl.h, hsl.s, n)} />
        <Field label="A" value={100} onCommit={() => {}} suffix="%" />
      </div>
      <div className="cp-presets">
        {PRESETS.map(p => (
          <button
            key={p}
            className={`cp-preset${p.toLowerCase() === value.toLowerCase() ? ' active' : ''}`}
            style={{ background: p }}
            onClick={() => onChange(p)}
          />
        ))}
      </div>
    </div>
  )
}

export function ColorPickerField({ label, value, chosen, isOpen, onOpen, onClose, onChange }) {
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  return (
    <div className="p-row cp-wrap" ref={wrapRef}>
      <span className="p-label">{label}</span>
      <button
        type="button"
        className={`cp-swatch${isOpen ? ' active' : ''}${chosen ? ' selected' : ''}`}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        {chosen
          ? <span className="cp-swatch-fill" style={{ background: value }} />
          : <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10"/></svg>}
      </button>
      {isOpen && (
        <div className="cp-popover">
          <ColorSelector value={value} onChange={hex => { onChange(hex); }} />
        </div>
      )}
    </div>
  )
}
