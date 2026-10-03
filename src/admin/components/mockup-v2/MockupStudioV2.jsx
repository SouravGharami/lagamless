import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MockupToolbar from './MockupToolbar.jsx'
import MockupSidebar from './MockupSidebar.jsx'
import MockupWorkspace from './MockupWorkspace.jsx'
import PropertiesPanel from './PropertiesPanel.jsx'
import { findArtwork, placementsOfArtwork } from './mockupStudioState.js'
import HumanModelStudio from './human-model/HumanModelStudio.jsx'
import './MockupStudioV2.css'

/**
 * Full-screen Mockup Studio shell. Stateless: the launcher owns the reducer
 * state so work survives closing and reopening the studio.
 */
export default function MockupStudioV2({ state, dispatch, onClose, unsaved = false, humanModel }) {
  const closeRef = useRef(null)
  // 'studio' = the existing workspace (unchanged); 'human' = Human Model Studio (Step 1 foundation).
  const [mode, setMode] = useState('studio')
  const { selectedArtworkId, activeSurface } = state.composition
  const selected = findArtwork(state.composition, selectedArtworkId)

  // Escape closes; body scroll is locked while the workspace is open.
  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event) {
      // A confirmation dialog inside the studio (e.g. "Replace mockup?") handles Escape itself; it must not also close the studio.
      if (event.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div className="mv2" role="dialog" aria-modal="true" aria-labelledby="mv2-title">
      <MockupToolbar
        previewMode={state.ui.previewMode}
        onTogglePreview={() => dispatch({ type: 'TOGGLE_PREVIEW' })}
        onClose={onClose}
        closeRef={closeRef}
        unsaved={unsaved}
      />

      {state.ui.notice && (
        <div className="mv2-notice" role="alert">
          <span>{state.ui.notice}</span>
          <button type="button" className="mv2-notice__dismiss" onClick={() => dispatch({ type: 'CLEAR_NOTICE' })}>
            Dismiss
          </button>
        </div>
      )}

      {humanModel && (
        <div className="mv2-modes" role="tablist" aria-label="Studio sections">
          {[['studio', 'Studio'], ['human', 'Human Model']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={mode === key} className={`mv2-mode${mode === key ? ' is-active' : ''}`} onClick={() => setMode(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'human' && humanModel ? (
        // INTEGRATION BOUNDARY: Human Model Studio only READS the studio state (finished composition); it never dispatches to it.
        <div className="mv2-body mv2-body--human">
          <HumanModelStudio studioState={state} humanModel={humanModel} />
        </div>
      ) : (
        <div className="mv2-body" data-surface={activeSurface}>
          <MockupSidebar state={state} dispatch={dispatch} />
          <MockupWorkspace state={state} dispatch={dispatch} />
          <PropertiesPanel key={selected?.id || 'none'} layer={selected} placements={selected ? placementsOfArtwork(state.composition, selected) : {}} dispatch={dispatch} />
        </div>
      )}
    </div>,
    document.body,
  )
}
