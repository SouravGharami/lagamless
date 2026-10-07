import { useEffect, useRef, useState } from 'react'
import { hexToHsv, hsvToHex, normalizeHex } from '../../lib/colorMath.js'

/**
 * Curated T-shirt shades for one-click picking. Same values the brand/apparel palette in
 * src/lib/colorNaming.js already uses, so a preset and a hand-picked nearby shade get the same name.
 */
export const TEE_PRESETS = Object.freeze([
  { name: 'White', hex: '#ffffff' },
  { name: 'Bone', hex: '#e8e2d3' },
  { name: 'Cream', hex: '#f2e9d8' },
  { name: 'Sand', hex: '#d9c4a3' },
  { name: 'Stone', hex: '#b7ab95' },
  { name: 'Grey', hex: '#8b877e' },
  { name: 'Graphite', hex: '#55534c' },
  { name: 'Charcoal', hex: '#3a3a38' },
  { name: 'Black', hex: '#111111' },
  { name: 'Navy', hex: '#1e2536' },
  { name: 'Royal Blue', hex: '#2f4b9c' },
  { name: 'Sky Blue', hex: '#77b6e0' },
  { name: 'Teal', hex: '#1f6f6a' },
  { name: 'Forest Green', hex: '#2f5233' },
  { name: 'Olive', hex: '#565a3f' },
  { name: 'Sage', hex: '#9caf88' },
  { name: 'Mustard', hex: '#d9a441' },
  { name: 'Rust', hex: '#b3562f' },
  { name: 'Maroon', hex: '#6e2320' },
  { name: 'Burgundy', hex: '#5c1a2b' },
  { name: 'Coral', hex: '#e8836b' },
  { name: 'Pink', hex: '#e79ab0' },
  { name: 'Lavender', hex: '#b6a4d1' },
  { name: 'Purple', hex: '#5b3a70' },
])

const clamp01 = (n) => Math.min(1, Math.max(0, n))

/** A draggable / arrow-key-driven surface that reports a 0-1 position. */
function useDrag(onMove) {
  const ref = useRef(null)
  function read(e) {
    const r = ref.current.getBoundingClientRect()
    onMove(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height))
  }
  return {
    ref,
    onPointerDown(e) {
      e.currentTarget.setPointerCapture(e.pointerId)
      read(e)
    },
    onPointerMove(e) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) read(e)
    },
  }
}

/**
 * Visual color picker — saturation/brightness field, hue slider and preset swatches. There is deliberately NO
 * text input anywhere: the value can only be chosen visually. The hex is shown as read-only text for reference.
 *
 * @param {object} props
 * @param {string} props.value - current '#rrggbb'
 * @param {(hex: string, presetName?: string) => void} props.onChange - `presetName` is set only when a preset was clicked
 */
export default function ColorPicker({ value, onChange }) {
  const current = normalizeHex(value) || '#111111'
  const [hsv, setHsv] = useState(() => hexToHsv(current))

  // Re-sync when the value changes from outside (a preset click, another row) without losing the hue the admin
  // is dragging through when saturation or brightness hits 0 (where hex can't carry a hue).
  useEffect(() => {
    setHsv((prev) => (hsvToHex(prev.h, prev.s, prev.v) === current ? prev : hexToHsv(current)))
  }, [current])

  function commit(next) {
    setHsv(next)
    onChange(hsvToHex(next.h, next.s, next.v))
  }

  const field = useDrag((x, y) => commit({ h: hsv.h, s: x, v: 1 - y }))
  const hue = useDrag((x) => commit({ ...hsv, h: x * 360 }))

  function fieldKey(e) {
    const step = e.shiftKey ? 0.1 : 0.02
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (!d) return
    e.preventDefault()
    commit({ h: hsv.h, s: clamp01(hsv.s + d[0]), v: clamp01(hsv.v + d[1]) })
  }
  function hueKey(e) {
    const step = e.shiftKey ? 20 : 4
    const d = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key]
    if (d === undefined) return
    e.preventDefault()
    commit({ ...hsv, h: (hsv.h + d + 360) % 360 })
  }

  return (
    <div className="admin-picker">
      <div
        {...field}
        className="admin-picker__field"
        style={{ '--picker-hue': `hsl(${hsv.h}, 100%, 50%)` }}
        tabIndex={0}
        role="slider"
        aria-label="Shade: saturation and brightness"
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        aria-valuenow={Math.round(hsv.s * 100)}
        onKeyDown={fieldKey}
      >
        <span className="admin-picker__thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
      </div>

      <div
        {...hue}
        className="admin-picker__hue"
        tabIndex={0}
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={hueKey}
      >
        <span className="admin-picker__thumb admin-picker__thumb--hue" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }} />
      </div>

      <div className="admin-picker__presets" role="group" aria-label="Common T-shirt colors">
        {TEE_PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            className={`admin-picker__preset${p.hex === current ? ' is-active' : ''}`}
            style={{ background: p.hex }}
            title={p.name}
            aria-label={p.name}
            aria-pressed={p.hex === current}
            onClick={() => {
              setHsv(hexToHsv(p.hex))
              onChange(p.hex, p.name)
            }}
          />
        ))}
      </div>

      <p className="admin-picker__readout">
        <span className="admin-picker__chip" style={{ background: current }} aria-hidden="true" />
        <span>Selected {current}</span>
      </p>
    </div>
  )
}
