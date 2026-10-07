import { useEffect, useRef, useState } from 'react'
import './garmentDetection.css'
import { SENSITIVITY } from './detectGarment.js'
import { PREVIEW_MODES, buildMaskBlob, paintPreview } from './garmentMaskIO.js'
import { useGarmentDetection } from './useGarmentDetection.js'

const LEVEL_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

/**
 * Admin preview for automatic garment detection. Detection starts by itself when a T-shirt photo is uploaded; this
 * panel only DISPLAYS the detected area so it can be verified. Nothing changes in the studio unless the admin presses
 * "Use as T-shirt mask", which uses the studio's own SET_MASK action (same slot the manual mask upload fills).
 */
export default function GarmentDetectionPanel({ tshirt, tshirtMask, dispatch }) {
  const det = useGarmentDetection(tshirt)
  const [mode, setMode] = useState('overlay')
  const [opacity, setOpacity] = useState(0.55)
  const [busy, setBusy] = useState(null) // 'apply' | 'download'
  const [actionError, setActionError] = useState(null)
  const canvasRef = useRef(null)

  const ready = det.status === 'ready' && det.result
  const found = ready && det.result.ok

  useEffect(() => {
    if (found && canvasRef.current) paintPreview(canvasRef.current, det.photo, det.result, mode, opacity)
  }, [found, det.photo, det.result, mode, opacity])

  useEffect(() => { setActionError(null) }, [tshirt?.id])

  if (!tshirt) {
    return (
      <div className="mv2-group">
        <h3 className="mv2-group__title">Garment detection</h3>
        <p className="mv2-hint">Upload a finished T-shirt photo and the T-shirt area is detected automatically.</p>
      </div>
    )
  }

  const baseName = `${tshirt.name || 'tshirt'}-garment-mask`
  async function makeBlob() {
    return buildMaskBlob(det.result, tshirt.width, tshirt.height)
  }
  async function useAsMask() {
    setBusy('apply'); setActionError(null)
    try {
      const url = URL.createObjectURL(await makeBlob())
      dispatch({ type: 'SET_MASK', kind: 'tshirt', asset: { url, name: baseName, width: tshirt.width, height: tshirt.height } })
    } catch (err) {
      setActionError(err?.message || 'Could not create the mask.')
    } finally { setBusy(null) }
  }
  async function download() {
    setBusy('download'); setActionError(null)
    try {
      const url = URL.createObjectURL(await makeBlob())
      const a = Object.assign(document.createElement('a'), { href: url, download: `${baseName}.png` })
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      setActionError(err?.message || 'Could not export the mask.')
    } finally { setBusy(null) }
  }

  const s = ready ? det.result.stats : null
  return (
    <div className="mv2-group mv2-gd">
      <div className="mv2-group__head">
        <h3 className="mv2-group__title">Garment detection</h3>
        <select className="mv2-select mv2-gd__sens" value={det.sensitivity} onChange={(e) => det.setSensitivity(e.target.value)} aria-label="Detection sensitivity" disabled={det.status === 'detecting'}>
          {Object.entries(SENSITIVITY).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
        </select>
      </div>

      {det.status === 'detecting' && (
        <p className="mv2-status" role="status"><span className="mv2-spinner" aria-hidden="true" />Detecting the T-shirt area…</p>
      )}
      {det.status === 'failed' && <p className="mv2-status mv2-status--error" role="alert">{det.error}</p>}

      {ready && !found && (
        <p className="mv2-hint mv2-hint--accent" role="status">{s.warnings[0] || 'No T-shirt could be detected in this photo.'} Try another sensitivity, or upload the mask manually below.</p>
      )}

      {found && (
        <>
          <div className="mv2-gd__tabs" role="tablist" aria-label="Preview">
            {PREVIEW_MODES.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={`mv2-btn${mode === m.id ? ' is-active' : ''}`} onClick={() => setMode(m.id)}>{m.label}</button>
            ))}
          </div>
          <div className="mv2-gd__stage" style={{ aspectRatio: `${det.result.width} / ${det.result.height}` }}>
            <canvas ref={canvasRef} className="mv2-gd__canvas" role="img" aria-label={`Detected T-shirt area, ${mode} view`} />
          </div>
          {mode === 'overlay' && (
            <label className="mv2-gd__opacity">
              <span className="mv2-hint">Tint</span>
              <input type="range" min="0.15" max="0.85" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            </label>
          )}
          <p className="mv2-gd__stats">
            <span>{Math.round(s.coverage * 100)}% of photo</span>
            <span className={`mv2-gd__level mv2-gd__level--${s.level}`}>{LEVEL_LABEL[s.level]} confidence</span>
            <span className="mv2-gd__swatch"><i style={{ background: s.fabricColor }} />{s.fabricColor}</span>
          </p>
          {s.warnings.map((w) => <p key={w} className="mv2-hint mv2-hint--accent">{w}</p>)}
          <p className="mv2-hint">Green = detected T-shirt fabric (prints included). Hanger, mannequin, skin and background stay outside.</p>

          <div className="mv2-actions">
            <button type="button" className="mv2-btn mv2-btn--primary" onClick={useAsMask} disabled={!!busy}>
              {busy === 'apply' ? 'Creating…' : tshirtMask ? 'Replace T-shirt mask' : 'Use as T-shirt mask'}
            </button>
            <button type="button" className="mv2-btn" onClick={download} disabled={!!busy}>{busy === 'download' ? 'Exporting…' : 'Download mask PNG'}</button>
            <button type="button" className="mv2-btn" onClick={det.rerun} disabled={!!busy}>Re-detect</button>
          </div>
          {actionError && <p className="mv2-status mv2-status--error" role="alert">{actionError}</p>}
        </>
      )}
    </div>
  )
}
