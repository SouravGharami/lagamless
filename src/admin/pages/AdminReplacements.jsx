import { useEffect, useMemo, useState } from 'react'
import {
  getReplacements,
  approveReplacement,
  rejectReplacement,
  markReturnReceived,
  markVerificationPassed,
  failReplacementVerification,
  shipReplacement,
  markReplacementDelivered,
  updateReplacementAdminNote,
} from '../../services/adminReplacements.js'
import { useAuth } from '../../context/AuthContext.jsx'
// Both dialogs are generic (they just ask for a required reason, or for
// optional shipment details), so they're reused here through their props —
// neither component itself is changed for replacements.
import RejectReturnDialog from '../components/RejectReturnDialog.jsx'
import ReplacementShipmentDialog from '../components/ReplacementShipmentDialog.jsx'
import AdminNoteDialog from '../components/AdminNoteDialog.jsx'
import { REPLACEMENT_STATUS_LABELS } from '../../lib/replacementStatus.js'

// Replacements share a couple of status keys (`rejected`) with Returns, and
// have their own full set otherwise, so this page renders its own badge
// instead of the shared admin StatusBadge component — see
// src/lib/replacementStatus.js for the label text.
const REPLACEMENT_BADGE_CLASS = {
  requested: 'admin-badge--warning',
  awaiting_return: 'admin-badge--warning',
  return_received: 'admin-badge--warning',
  replacement_processing: 'admin-badge--neutral',
  replacement_shipped: 'admin-badge--neutral',
  replacement_completed: 'admin-badge--positive',
  rejected: 'admin-badge--negative',
}

function ReplacementStatusBadge({ status }) {
  const label = REPLACEMENT_STATUS_LABELS[status] ?? status
  const className = REPLACEMENT_BADGE_CLASS[status] || 'admin-badge--neutral'
  return <span className={'admin-badge ' + className}>{label}</span>
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'requested', label: 'Requested' },
  { key: 'awaiting_return', label: 'Awaiting return' },
  { key: 'return_received', label: 'Return received' },
  { key: 'replacement_processing', label: 'Processing' },
  { key: 'replacement_shipped', label: 'Shipped' },
  { key: 'replacement_completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Admin Replacements page — the separate replacement workflow (returns and
 * refunds live on the Returns page and are untouched by this one).
 *
 *   Requested -> Approve (reserves stock) -> Awaiting Return
 *   Awaiting Return -> Mark Return Received -> Return Received
 *   Return Received -> Verification Passed -> Replacement Processing
 *   Return Received -> Verification Failed -> Rejected (releases reserved stock)
 *   Replacement Processing -> Ship Replacement (tracking optional) -> Replacement Shipped
 *   Replacement Shipped -> Mark Delivered -> Replacement Completed
 *   Requested -> Reject (reason required, shown to the customer)
 *
 * Reads/writes `public.replacements` under the admin policy from
 * supabase/part-26-replacements.sql — run that migration, then part-27 and
 * part-28, first.
 */
function AdminReplacements() {
  const { user, isAdmin } = useAuth()
  const [replacements, setReplacements] = useState(null) // null = still loading
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [rowError, setRowError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [verifyFailTarget, setVerifyFailTarget] = useState(null)
  const [shipTarget, setShipTarget] = useState(null)
  const [noteTarget, setNoteTarget] = useState(null)

  function refresh() {
    return getReplacements()
      .then((data) => {
        setReplacements(data)
        setError(null)
      })
      .catch((err) => {
        setError(err.message)
        setReplacements((prev) => prev ?? [])
      })
  }

  useEffect(() => {
    let cancelled = false
    getReplacements()
      .then((data) => {
        if (cancelled) return
        setReplacements(data)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setReplacements([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = replacements === null

  const filtered = useMemo(() => {
    if (!replacements) return []
    const term = search.trim().toLowerCase()
    return replacements.filter((rep) => {
      const matchesStatus = status === 'all' || rep.status === status
      const matchesSearch =
        !term ||
        rep.orderId.toLowerCase().includes(term) ||
        (rep.customerName || '').toLowerCase().includes(term) ||
        (rep.customerEmail || '').toLowerCase().includes(term) ||
        (rep.productName || '').toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [replacements, search, status])

  async function handleAction(id, action) {
    setRowError(null)
    setSavingId(id)
    try {
      const updated = await action()
      setReplacements((prev) => (prev ? prev.map((r) => (r.id === id ? updated : r)) : prev))
      setSavedId(id)
      window.setTimeout(() => setSavedId((prev) => (prev === id ? null : prev)), 1500)
      return true
    } catch (err) {
      setRowError(err.message)
      // Something changed under us (already moved on, stock gone, permission) —
      // resync so the row shows its real status and only the valid buttons.
      await refresh()
      return false
    } finally {
      setSavingId(null)
    }
  }

  async function confirmReject(reason) {
    if (!rejectTarget) return
    const ok = await handleAction(rejectTarget.id, () => rejectReplacement(rejectTarget.id, reason))
    if (ok) setRejectTarget(null)
  }

  async function confirmVerifyFail(reason) {
    if (!verifyFailTarget) return
    const ok = await handleAction(verifyFailTarget.id, () => failReplacementVerification(verifyFailTarget.id, reason))
    if (ok) setVerifyFailTarget(null)
  }

  async function confirmShip(details) {
    if (!shipTarget) return
    const ok = await handleAction(shipTarget.id, () => shipReplacement(shipTarget.id, details))
    if (ok) setShipTarget(null)
  }

  async function confirmNote(note) {
    if (!noteTarget) return
    const ok = await handleAction(noteTarget.id, () => updateReplacementAdminNote(noteTarget.id, note))
    if (ok) setNoteTarget(null)
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Replacements</h1>
          <p className="text-small">
            Replacement requests from delivered orders. Approving a request reserves the stock for the size the
            customer asked for; the customer then sends the original item back before the replacement ships. This is
            separate from Returns — nothing here refunds anything.
          </p>
          <p className="text-small">
            Signed in as {user?.email || 'unknown'} · admin check:{' '}
            {isAdmin === true ? 'confirmed admin' : isAdmin === false ? 'NOT admin — this is why the list is empty' : 'still checking…'}
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          className="input admin-toolbar__search"
          placeholder="Search by order ID, customer name, email, or product"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search replacements"
        />
        <div className="admin-filter-row" role="group" aria-label="Filter replacements by status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={'admin-filter-chip' + (status === f.key ? ' admin-filter-chip--active' : '')}
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="admin-form__summary" role="alert">
          {error}
        </p>
      )}
      {rowError && (
        <p className="admin-form__summary" role="alert">
          {rowError}
        </p>
      )}

      {loading ? (
        <p className="text-small">Loading replacements…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-lead">
            {replacements.length === 0 ? 'No replacement requests yet.' : 'No replacements match this view.'}
          </p>
          <p className="text-small">
            {replacements.length === 0
              ? isAdmin === false
                ? "Your account isn't flagged as admin in profiles.role, so the RLS policy correctly shows you nothing. Promote your account per supabase/SETUP.md §11, then sign out and back in."
                : 'No customer has requested a replacement yet — mark a test order delivered, then use Replace on it from /login.'
              : 'Try a different search term or status filter.'}
          </p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-replacements-table">
            <thead>
              <tr>
                <th scope="col">Order #</th>
                <th scope="col">Customer</th>
                <th scope="col">Product</th>
                <th scope="col">Requested change</th>
                <th scope="col">Reason</th>
                <th scope="col">Requested</th>
                <th scope="col">Status</th>
                <th scope="col">Internal note</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rep) => {
                const isSaving = savingId === rep.id
                return (
                  <tr key={rep.id}>
                    <td>#{rep.orderId.slice(0, 8).toUpperCase()}</td>
                    <td>
                      {rep.customerName || 'Guest'}
                      {rep.customerEmail && (
                        <>
                          <br />
                          <span className="text-small">{rep.customerEmail}</span>
                        </>
                      )}
                      {rep.customerPhone && (
                        <>
                          <br />
                          <span className="text-small">{rep.customerPhone}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                        <div className="admin-products-table__thumb" style={{ flexShrink: 0 }}>
                          {rep.productImage ? (
                            <img src={rep.productImage} alt={rep.productName || 'Product'} />
                          ) : (
                            <span className="text-label">No image</span>
                          )}
                        </div>
                        <div>
                          {rep.productName || 'Item no longer on the order'}
                          <br />
                          <span className="text-small">SKU: {rep.sku || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="admin-replacements-table__stack">
                        <span className="admin-replacements-table__change-primary">
                          Size: {rep.originalSize || '—'} → <strong>{rep.requestedSize}</strong>
                        </span>
                        <span className="text-small">
                          Color: {rep.originalColor || '—'} → {rep.requestedColor || 'Same color'}
                        </span>
                        <span className="text-small">Qty: {rep.quantity}</span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-replacements-table__stack">
                        <span className="admin-replacements-table__reason-value">Reason: {rep.reason}</span>
                        {rep.customerNote && (
                          <span className="text-small admin-replacements-table__note">
                            Customer note: "{rep.customerNote}"
                          </span>
                        )}
                        {rep.status === 'rejected' && rep.rejectionReason && (
                          <span className="text-small admin-replacements-table__note">
                            Rejection reason: "{rep.rejectionReason}"
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{formatDate(rep.requestedAt)}</td>
                    <td>
                      <ReplacementStatusBadge status={rep.status} />
                      {rep.status === 'awaiting_return' && rep.approvedAt && (
                        <>
                          <br />
                          <span className="text-small">{formatDate(rep.approvedAt)} · stock reserved</span>
                        </>
                      )}
                      {rep.status === 'return_received' && rep.returnReceivedAt && (
                        <>
                          <br />
                          <span className="text-small">{formatDate(rep.returnReceivedAt)}</span>
                        </>
                      )}
                      {rep.status === 'replacement_processing' && rep.verifiedAt && (
                        <>
                          <br />
                          <span className="text-small">Verified {formatDate(rep.verifiedAt)}</span>
                        </>
                      )}
                      {(rep.status === 'replacement_shipped' || rep.status === 'replacement_completed') && (
                        <>
                          {rep.shippedAt && (
                            <>
                              <br />
                              <span className="text-small">Shipped {formatDate(rep.shippedAt)}</span>
                            </>
                          )}
                          {(rep.trackingCourier || rep.trackingId || rep.trackingUrl) && (
                            <>
                              <br />
                              <span className="text-small">
                                {rep.trackingCourier}
                                {rep.trackingCourier && rep.trackingId ? ' · ' : ''}
                                {rep.trackingId}
                              </span>
                              {rep.trackingUrl && (
                                <>
                                  <br />
                                  <a
                                    className="text-small"
                                    href={rep.trackingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Track package
                                  </a>
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                      {rep.status === 'replacement_completed' && rep.deliveredAt && (
                        <>
                          <br />
                          <span className="text-small">Delivered {formatDate(rep.deliveredAt)}</span>
                        </>
                      )}
                      {rep.hasOpenReturn && rep.status !== 'rejected' && (
                        <>
                          <br />
                          <span className="admin-badge admin-badge--warning">Return also open</span>
                        </>
                      )}
                    </td>
                    <td>
                      {rep.adminNote ? (
                        <span className="text-small">{rep.adminNote}</span>
                      ) : (
                        <span className="text-small">—</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-order-actions">
                        {rep.status === 'requested' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => handleAction(rep.id, () => approveReplacement(rep.id))}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn admin-btn-danger admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => setRejectTarget(rep)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {rep.status === 'awaiting_return' && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => handleAction(rep.id, () => markReturnReceived(rep.id))}
                          >
                            Mark return received
                          </button>
                        )}
                        {rep.status === 'return_received' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => handleAction(rep.id, () => markVerificationPassed(rep.id))}
                            >
                              Verification passed
                            </button>
                            <button
                              type="button"
                              className="btn admin-btn-danger admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => setVerifyFailTarget(rep)}
                            >
                              Verification failed
                            </button>
                          </>
                        )}
                        {rep.status === 'replacement_processing' && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => setShipTarget(rep)}
                          >
                            Ship replacement
                          </button>
                        )}
                        {rep.status === 'replacement_shipped' && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => handleAction(rep.id, () => markReplacementDelivered(rep.id))}
                          >
                            Mark delivered
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary admin-order-actions__btn"
                          disabled={isSaving}
                          onClick={() => setNoteTarget(rep)}
                        >
                          {rep.adminNote ? 'Edit note' : 'Add note'}
                        </button>
                        {isSaving && <span className="text-small">Saving…</span>}
                        {savedId === rep.id && !isSaving && <span className="text-small">Saved</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <RejectReturnDialog
        open={Boolean(rejectTarget)}
        returnRequest={rejectTarget}
        saving={Boolean(rejectTarget) && savingId === rejectTarget.id}
        onConfirm={confirmReject}
        onCancel={() => setRejectTarget(null)}
        title="Reject this replacement request?"
        descriptionSuffix="A reason is required — it's saved with the request and shown to the customer on their order."
        fieldLabel="Rejection reason"
        placeholder="e.g. The damage looks like wear after use"
        fieldErrorMessage="Enter a reason so the rejection can be recorded."
        cancelLabel="Keep as requested"
        confirmLabel="Reject replacement"
        savingLabel="Rejecting…"
      />

      <RejectReturnDialog
        open={Boolean(verifyFailTarget)}
        returnRequest={verifyFailTarget}
        saving={Boolean(verifyFailTarget) && savingId === verifyFailTarget.id}
        onConfirm={confirmVerifyFail}
        onCancel={() => setVerifyFailTarget(null)}
        title="Mark verification as failed?"
        descriptionSuffix="A reason is required — the reserved stock is released, the request is rejected, and the reason is shown to the customer."
        fieldLabel="Verification failure reason"
        placeholder="e.g. Received item doesn't match what was originally ordered"
        fieldErrorMessage="Enter a reason so the outcome can be recorded."
        cancelLabel="Cancel"
        confirmLabel="Fail verification"
        savingLabel="Recording…"
      />

      <ReplacementShipmentDialog
        open={Boolean(shipTarget)}
        target={shipTarget}
        saving={Boolean(shipTarget) && savingId === shipTarget.id}
        onConfirm={confirmShip}
        onCancel={() => setShipTarget(null)}
      />

      <AdminNoteDialog
        open={Boolean(noteTarget)}
        target={noteTarget}
        saving={Boolean(noteTarget) && savingId === noteTarget.id}
        onConfirm={confirmNote}
        onCancel={() => setNoteTarget(null)}
      />
    </div>
  )
}

export default AdminReplacements
