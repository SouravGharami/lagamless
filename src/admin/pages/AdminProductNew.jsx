import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProductForm from '../components/ProductForm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { createProduct } from '../../services/adminProducts.js'
import { loadDraft, clearDraft, createDraftAutosaver } from '../lib/productDraft.js'

/**
 * Add Product page.
 *
 * On top of rendering `ProductForm`, this page owns local-draft
 * persistence for the *new* product flow only (see
 * `src/admin/lib/productDraft.js`):
 *   - On mount, a previously saved draft (if any and not corrupted) is
 *     restored into the form instead of the empty default.
 *   - Every form change is autosaved to localStorage, debounced.
 *   - The draft is cleared after a successful product creation, or when
 *     the admin explicitly clicks "Clear draft".
 *   - Leaving the page any other way (closing the tab, navigating away,
 *     a refresh) intentionally leaves the draft in place.
 */
function AdminProductNew() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)

  // Read once, synchronously, before the first render of ProductForm —
  // this is what lets a restored draft be the *initial* state instead of
  // the form first mounting empty and then jumping to the draft a tick
  // later (which would also risk autosaving an empty form over a good
  // draft).
  const [{ initialFormState, restored }] = useState(() => {
    const draft = loadDraft()
    return { initialFormState: draft?.form ?? null, restored: Boolean(draft) }
  })

  // `formKey` is bumped to force ProductForm to remount with a *blank*
  // form after "Clear draft" — ProductForm only reads its initial state
  // once (lazy useState initializer), so this is the smallest way to
  // reset it without ProductForm needing an imperative reset API.
  const [formKey, setFormKey] = useState(0)

  const [draftStatus, setDraftStatus] = useState(restored ? 'restored' : 'idle')
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  // One autosaver instance for the page's lifetime — debounces rapid
  // keystrokes into a single localStorage write instead of writing on
  // every character. `setDraftStatus` is stable (React guarantees this),
  // so this closure never goes stale and this only needs to be created
  // once (lazy useState initializer, not useMemo/useRef — no refs
  // involved, nothing read during render).
  const [autosave] = useState(() => createDraftAutosaver(() => setDraftStatus('saved')))

  // The "Draft saved" pulse fades back to the idle label after a couple
  // of seconds — driven by `draftStatus` itself rather than a ref/timer
  // stashed outside React's render cycle.
  useEffect(() => {
    if (draftStatus !== 'saved') return undefined
    const timeoutId = setTimeout(() => setDraftStatus('idle'), 2000)
    return () => clearTimeout(timeoutId)
  }, [draftStatus])

  useEffect(() => {
    return () => {
      // Flush so a save that was mid-debounce when the admin navigated
      // away still lands — "intentionally leaves the page" should still
      // keep the *latest* typed text, not whatever was last written a
      // moment ago.
      autosave.flush()
    }
  }, [autosave])

  function handleFormChange(form) {
    autosave(form)
  }

  async function handleSubmit(data) {
    try {
      setServerError(null)
      await createProduct(data)
      autosave.cancel()
      clearDraft()
      navigate('/admin/products')
    } catch (error) {
      setServerError(error.message)
    }
  }

  function handleClearDraftClick() {
    setConfirmClearOpen(true)
  }

  function handleClearDraftConfirm() {
    autosave.cancel()
    clearDraft()
    setFormKey((k) => k + 1)
    setConfirmClearOpen(false)
    setDraftStatus('idle')
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Add product</h1>
          <p className="text-small">Saved directly to Supabase — products, sizes/stock, and images all persist immediately.</p>
        </div>
      </div>

      <div className="admin-draft-banner" role="status" aria-live="polite">
        <div className="admin-draft-banner__status">
          {draftStatus === 'restored' && <span className="text-label">Draft restored</span>}
          {draftStatus === 'saved' && <span className="text-label">Draft saved</span>}
          {draftStatus === 'idle' && <span className="text-label">Autosaves as you type</span>}
        </div>
        <button type="button" className="btn-ghost" onClick={handleClearDraftClick}>
          Clear draft
        </button>
      </div>

      {/* `formKey === 0` is the initial mount, where a restored draft (if
          any) should be used; any remount after that (only ever from
          "Clear draft") should start from the blank default instead — see
          `handleClearDraftConfirm`. */}
      <ProductForm
        key={formKey}
        initialFormState={formKey === 0 ? initialFormState : null}
        onFormChange={handleFormChange}
        onSubmit={handleSubmit}
        submitLabel="Create product"
        serverError={serverError}
      />

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear draft?"
        description="This clears the locally saved draft and resets the form. This can't be undone."
        confirmLabel="Clear draft"
        destructive
        onConfirm={handleClearDraftConfirm}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  )
}

export default AdminProductNew
