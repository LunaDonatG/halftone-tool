import { useState } from 'react'
import { DialStore } from 'dialkit'
import { PANEL_ID } from './dialConfig.js'
import { ColorPickerField } from './ColorPicker.jsx'

const set = (path, value) => {
  const panel = DialStore.getPanels().find(p => p.name === PANEL_ID)
  if (panel) DialStore.updateValue(panel.id, path, value)
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Section({ title, children, divider = false }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`p-section${divider ? ' p-section-divider' : ''}`}>
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

function SegmentedToggle({ label, value, path, invert = false }) {
  const write = on => set(path, invert ? !on : on)
  return (
    <div className="p-seg-row">
      <span className="p-label">{label}</span>
      <div className="p-segmented" role="radiogroup" aria-label={label}>
        <button
          className={`p-segmented-btn${!value ? ' active' : ''}`}
          onClick={() => write(false)}
        >Off</button>
        <button
          className={`p-segmented-btn${value ? ' active' : ''}`}
          onClick={() => write(true)}
        >On</button>
      </div>
    </div>
  )
}

function Select({ label, value, options, path }) {
  return (
    <div className="p-row">
      <span className="p-label">{label}</span>
      <div className="p-dropdown">
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
    <div className="p-text-row">
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
  { id: 'dots',    icon: <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4"/></svg> },
  { id: 'squares', icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8"/></svg> },
  { id: 'lines',   icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" transform="rotate(45 8 8)"/></svg> },
  { id: 'bars',    icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="6.5" width="10" height="3" rx="1"/></svg> },
]

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function Panel({ params, onExport }) {
  const p = params.Properties
  const c = params.Color
  const o = params.Output
  const [openField, setOpenField] = useState(null)

  return (
    <aside className="panel">
      <div className="p-header">
        <span className="p-header-title">HALFTONE</span>
        <svg className="p-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/>
          <line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/>
          <line x1="4" y1="18" x2="20" y2="18"/><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none"/>
        </svg>
      </div>

      <Section title="PROPERTIES">
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

      <Section title="COLOR" divider>
        <ColorPickerField
          label="Main color" value={c.barColor} chosen={c.barColorSet}
          isOpen={openField === 'barColor'}
          onOpen={() => setOpenField('barColor')} onClose={() => setOpenField(null)}
          onChange={hex => { set('Color.barColor', hex); set('Color.barColorSet', true) }}
        />

        <SegmentedToggle label="Secondary color" value={c.secondaryEnabled} path="Color.secondaryEnabled" />
        {c.secondaryEnabled && (
          <>
            <ColorPickerField
              label="Secondary color" value={c.secondaryColor} chosen
              isOpen={openField === 'secondaryColor'}
              onOpen={() => setOpenField('secondaryColor')} onClose={() => setOpenField(null)}
              onChange={hex => set('Color.secondaryColor', hex)}
            />
            <Slider label="Amount" value={c.secondaryAmount} min={0} max={100} path="Color.secondaryAmount" />
          </>
        )}

        <SegmentedToggle label="Background color" value={!c.bgTransparent} path="Color.bgTransparent" invert />
        {!c.bgTransparent && (
          <ColorPickerField
            label="Background color" value={c.bgColor} chosen
            isOpen={openField === 'bgColor'}
            onOpen={() => setOpenField('bgColor')} onClose={() => setOpenField(null)}
            onChange={hex => set('Color.bgColor', hex)}
          />
        )}

        <SegmentedToggle label="Invert colors" value={c.invert} path="Color.invert" />
      </Section>

      <Section title="EXPORT" divider>
        <Select label="Aspect"    value={o.outputRatio}  options={['source','1:1','4:3','3:2','16:9','9:16','3:4','2:3']} path="Output.outputRatio" />
        <Select label="File type" value={o.exportFormat} options={['GIF','PNG']} path="Output.exportFormat" />
        <TextInput label="Filename" value={o.filename} path="Output.filename" placeholder="name" />
        <ActionButton label="Export" onClick={onExport} />
      </Section>
    </aside>
  )
}
