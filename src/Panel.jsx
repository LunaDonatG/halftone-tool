import { useEffect, useRef, useState } from 'react'
import { DialStore } from 'dialkit'
import { PANEL_ID, EFFECTS } from './dialConfig.js'
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

const ASPECT_LABELS = { source: 'Source' }

function Dropdown({ label, value, options, path, onChange, isOpen, onOpen, onClose, wide = false }) {
  const wrapRef = useRef(null)
  const commit = o => (path ? set(path, o) : onChange(o))

  useEffect(() => {
    if (!isOpen) return
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  const trigger = (
    <div className={`p-dd-wrap${wide ? ' wide' : ''}`} ref={label ? null : wrapRef}>
      <button
        type="button"
        className="p-dd-trigger"
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        <span>{ASPECT_LABELS[value] ?? value}</span>
        <svg className={`p-dd-chevron${isOpen ? ' open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {isOpen && (
        <div className="p-dd-menu">
          {options.map(o => (
            <button
              key={o}
              type="button"
              className={`p-dd-item${o === value ? ' selected' : ''}`}
              onClick={() => { commit(o); onClose() }}
            >
              <span>{ASPECT_LABELS[o] ?? o}</span>
              {o === value && (
                <svg className="p-dd-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8l3.5 3.5L13 5"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (!label) return trigger

  return (
    <div className="p-row" ref={wrapRef}>
      <span className="p-label">{label}</span>
      {trigger}
    </div>
  )
}

function TextInput({ label, value, path, placeholder }) {
  return (
    <div className="p-field-col">
      <span className="p-label">{label}</span>
      <input
        type="text"
        className="p-input"
        value={value}
        placeholder={placeholder}
        onChange={e => set(path, e.target.value)}
      />
    </div>
  )
}

function ActionButton({ label, onClick, disabled }) {
  return (
    <button className="p-action-btn" onClick={onClick} disabled={disabled}>{label}</button>
  )
}

const SHAPES = [
  { id: 'dots',    icon: <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4"/></svg> },
  { id: 'squares', icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8"/></svg> },
  { id: 'diamond', icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" transform="rotate(45 8 8)"/></svg> },
  { id: 'bars',    icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="6.5" width="10" height="3" rx="1"/></svg> },
]

function ColorControls({ c, openField, setOpenField }) {
  return (
    <>
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
    </>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function Panel({ params, onExport, canExport, effect, onEffectChange }) {
  const p = params.Properties
  const c = params.Color
  const o = params.Output
  const [openField, setOpenField] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const isAscii = effect === 'ASCII'

  if (collapsed) {
    return (
      <aside className="panel panel-collapsed">
        <button className="p-logo-btn" onClick={() => setCollapsed(false)} title="Expandir panel">
          <img src="/logo.svg" alt="" className="p-logo-img" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="panel">
      <div className="p-header">
        <button className="p-logo-btn" onClick={() => setCollapsed(true)} title="Colapsar panel">
          <img src="/logo.svg" alt="" className="p-logo-img" />
        </button>
        <Dropdown
          value={effect} options={EFFECTS} onChange={onEffectChange}
          isOpen={openField === 'effect'} wide
          onOpen={() => setOpenField('effect')} onClose={() => setOpenField(null)}
        />
      </div>

      <Section title="PROPERTIES">
        {isAscii ? (
          <>
            <Slider label="Cell Size" value={p.cellSize} min={6} max={40} path="Properties.cellSize" />
            <SegmentedToggle label="Character rotation" value={p.characterRotation} path="Properties.characterRotation" />
          </>
        ) : (
          <>
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
          </>
        )}
      </Section>

      <Section title="COLOR" divider>
        <ColorControls c={c} openField={openField} setOpenField={setOpenField} />
      </Section>

      <Section title="EXPORT" divider>
        <Dropdown
          label="Aspect" value={o.outputRatio}
          options={['source', '1:1', '4:3', '3:2', '16:9', '9:16', '3:4', '2:3']}
          path="Output.outputRatio"
          isOpen={openField === 'outputRatio'}
          onOpen={() => setOpenField('outputRatio')} onClose={() => setOpenField(null)}
        />
        <Dropdown
          label="File Type" value={o.exportFormat}
          options={['GIF', 'PNG']}
          path="Output.exportFormat"
          isOpen={openField === 'exportFormat'}
          onOpen={() => setOpenField('exportFormat')} onClose={() => setOpenField(null)}
        />
        <TextInput label="File Name" value={o.filename} path="Output.filename" placeholder="halftone" />
        <ActionButton label="Export" onClick={onExport} disabled={!canExport} />
      </Section>
    </aside>
  )
}
