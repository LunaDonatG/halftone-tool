import { useState, useRef } from 'react'
import { DialStore } from 'dialkit'
import { PANEL_ID } from './dialConfig.js'

const set = (path, value) => {
  const panel = DialStore.getPanels().find(p => p.name === PANEL_ID)
  if (panel) DialStore.updateValue(panel.id, path, value)
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Section({ title, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="p-section">
      <button className="p-section-header" onClick={() => setOpen(v => !v)}>
        <span>{title}</span>
        <svg className={`p-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && <div className="p-section-body">{children}</div>}
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, path }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="p-slider-row">
      <div className="p-slider-header">
        <span className="p-label">{label}</span>
        <span className="p-value">{value}</span>
      </div>
      <input
        type="range"
        className="p-slider"
        min={min} max={max} step={step}
        value={value}
        style={{ '--pct': `${pct}%` }}
        onChange={e => set(path, Number(e.target.value))}
      />
    </div>
  )
}

function Toggle({ label, value, path }) {
  return (
    <div className="p-row">
      <span className="p-label">{label}</span>
      <button
        className={`p-toggle${value ? ' on' : ''}`}
        onClick={() => set(path, !value)}
        role="switch"
        aria-checked={value}
      >
        <span className="p-toggle-thumb" />
      </button>
    </div>
  )
}

function ColorSwatch({ label, value, path }) {
  const inputRef = useRef(null)
  return (
    <div className="p-row">
      <span className="p-label">{label}</span>
      <label className="p-color-swatch" style={{ background: value }}>
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={e => set(path, e.target.value)}
        />
      </label>
    </div>
  )
}

function Select({ label, value, options, path }) {
  return (
    <div className="p-row">
      <span className="p-label">{label}</span>
      <div className="p-select-wrap">
        <select value={value} onChange={e => set(path, e.target.value)}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="p-select-chevron">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
    </div>
  )
}

function TextInput({ label, value, path, placeholder }) {
  return (
    <div className="p-row">
      <span className="p-label">{label}</span>
      <input
        type="text"
        className="p-text"
        value={value}
        placeholder={placeholder}
        onChange={e => set(path, e.target.value)}
      />
    </div>
  )
}

function ActionButton({ label, onClick }) {
  return (
    <button className="p-action-btn" onClick={onClick}>{label}</button>
  )
}

const SHAPES = [
  { id: 'dots',    icon: <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4.5"/></svg> },
  { id: 'squares', icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg> },
  { id: 'lines',   icon: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2L14 8L8 14L2 8Z"/></svg> },
  { id: 'bars',    icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="6.5" width="12" height="3" rx="1.5"/></svg> },
]

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function Panel({ params, onExport }) {
  const p = params.Properties
  const c = params.Color
  const o = params.Output

  return (
    <aside className="panel">

      <Section title="PROPERTIES">
        {/* Shape */}
        <div className="p-slider-row">
          <span className="p-label">Shape</span>
          <div className="p-shape-btns">
            {SHAPES.map(s => (
              <button
                key={s.id}
                className={`p-shape-btn${p.shape === s.id ? ' active' : ''}`}
                onClick={() => set('Properties.shape', s.id)}
              >
                {s.icon}
              </button>
            ))}
          </div>
        </div>

        <Slider label="Dot Size" value={p.dotSize}  min={5}  max={60}  path="Properties.dotSize" />
        <Slider label="Angle"    value={p.angle}    min={0}  max={90}  path="Properties.angle" />
        <Slider label="Contrast" value={p.contrast} min={50} max={200} path="Properties.contrast" />
        <Slider label="Spread"   value={p.spread}   min={0}  max={100} path="Properties.spread" />
      </Section>

      <Section title="COLOR">
        <ColorSwatch label="Ink color"   value={c.barColor}   path="Color.barColor" />
        <ColorSwatch label="Background"  value={c.bgColor}    path="Color.bgColor" />
        <Toggle      label="Transparent" value={c.bgTransparent} path="Color.bgTransparent" />
        <Toggle      label="Invert"      value={c.invert}     path="Color.invert" />
        <ColorSwatch label="Third color" value={c.thirdColor} path="Color.thirdColor" />
        <Slider      label="Third amount" value={c.thirdAmount} min={0} max={100} path="Color.thirdAmount" />
      </Section>

      <Section title="OUTPUT">
        <Select    label="Aspect Ratio" value={o.outputRatio}  options={['source','1:1','4:3','3:2','16:9','9:16','3:4','2:3']} path="Output.outputRatio" />
        <Select    label="Export as"    value={o.exportFormat} options={['GIF','PNG']} path="Output.exportFormat" />
        <TextInput label="Filename"     value={o.filename}     path="Output.filename" placeholder="halftone" />
        <ActionButton label="Export" onClick={onExport} />
      </Section>

    </aside>
  )
}
