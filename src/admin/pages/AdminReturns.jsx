import { useEffect, useMemo, useState } from 'react'
import {
  getReturns,
  approveReturn,
  rejectReturn,
  startReturnPickup,
  markReturnReceived,
  startInspection,
  passInspection,
  failInspection,
  initiateRefund,
} from '../../services/adminReturns.js'
import { useAuth } from '../../context/AuthContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import OrderItemThumb from '../components/OrderItemThumb.jsx'
import RejectReturnDialog from '../components/RejectReturnDialog.jsx'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'received', label: 'Received' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'refund_pending', label: 'Refund Pending' },
  { key: 'refunded', label: 'Refunded' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Same as formatDate() but with the time included — used for the refund
 * timestamp specifically, since "when exactly did this refund process"
 * is more useful than just the day for a money-movement event. */
function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Admin Returns page. Reads/writes `public.returns` under the "Admins can
 * manage returns" RLS policy + grant added in
 * supabase/part-19-admin-returns.sql — run that migration first, or every
 * query here will fail with a permission error (see the banner it would
 * show, same failure mode AdminOrders.jsx already handles for `orders`).
 *
 * Customer-facing submission (ReturnRequestDialog.jsx →
 * submit-return-request edge function) is untouched by this page — this
 * only ever reads existing rows and updates their `status`.
 */
function AdminReturns() {
  const { user, isAdmin } = useAuth()
  const [returns, setReturns] = useState(null) // null = still loading
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [rowError, setRowError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null) // return pending a reject confirmation
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null) // return pending an "Inspection Failed" reason
  const [codRefundTarget, setCodRefundTarget] = useState(null) // COD return awaiting its manual-refund reference

  function refresh() {
    return getReturns()
      .then((data) => {
        setReturns(data)
        setError(null)
      })
      .catch((err) => {
        setError(err.message)
        setReturns((prev) => prev ?? [])
      })
  }

  useEffect(() => {
    let cancelled = false
    getReturns()
      .then((data) => {
        if (cancelled) return
        setReturns(data)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setReturns([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = returns === null

  const filtered = useMemo(() => {
    if (!returns) return []
    const term = search.trim().toLowerCase()
    return returns.filter((ret) => {
      const matchesStatus = status === 'all' || ret.status === status
      const matchesSearch =
        !term ||
        ret.orderId.toLowerCase().includes(term) ||
        (ret.customerName || '').toLowerCase().includes(term) ||
        (ret.customerEmail || '').toLowerCase().includes(term) ||
        (ret.productName || '').toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [returns, search, status])

  async function handleDecision(returnId, action) {
    setRowError(null)
    setSavingId(returnId)
    try {
      const updated = await action()
      // Refresh the return data and reflect the updated status straight
      // from the server response — canDecide/canStartPickup below then
      // show only the buttons valid for this row's new status.
      setReturns((prev) => (prev ? prev.map((r) => (r.id === returnId ? updated : r)) : prev))
      setSavedId(returnId)
      window.setTimeout(() => setSavedId((prev) => (prev === returnId ? null : prev)), 1500)
      return true
    } catch (err) {
      setRowError(err.message)
      // Data may have changed under us (e.g. already decided by someone
      // else, or permission actually denied) — resync with the server so
      // the row's real current status/buttons are shown either way.
      await refresh()
      return false
    } finally {
      setSavingId(null)
    }
  }

  function handleApprove(ret) {
    handleDecision(ret.id, () => approveReturn(ret.id))
  }

  function handleStartPickup(ret) {
    handleDecision(ret.id, () => startReturnPickup(ret.id))
  }

  function handleMarkReceived(ret) {
    handleDecision(ret.id, () => markReturnReceived(ret.id))
  }

  function handleStartInspection(ret) {
    handleDecision(ret.id, () => startInspection(ret.id))
  }

  function handlePassInspection(ret) {
    handleDecision(ret.id, () => passInspection(ret.id))
  }

  function handleInitiateRefund(ret) {
    handleDecision(ret.id, () => initiateRefund(ret.id))
  }

  // Cash on Delivery refunds are sent by hand (UPI / bank transfer) — the admin
  // records the transfer reference here and the return is marked refunded.
  async function confirmCodRefund(reference) {
    if (!codRefundTarget) return
    const ok = await handleDecision(codRefundTarget.id, () => initiateRefund(codRefundTarget.id, reference))
    if (ok) setCodRefundTarget(null)
  }

  async function confirmReject(reason) {
    if (!rejectTarget) return
    const ok = await handleDecision(rejectTarget.id, () => rejectReturn(rejectTarget.id, reason))
    if (ok) setRejectTarget(null)
  }

  async function confirmFailInspection(reason) {
    if (!inspectionFailTarget) return
    const ok = await handleDecision(inspectionFailTarget.id, () => failInspection(inspectionFailTarget.id, reason))
    if (ok) setInspectionFailTarget(null)
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Returns</h1>
          <p className="text-small">
            Connected live to Supabase. Return requests appear here as soon as a customer submits one from a
            delivered order — if the list is empty, no return has been requested against this project yet.
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
          aria-label="Search returns"
        />
        <div className="admin-filter-row" role="group" aria-label="Filter returns by status">
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
        <p className="text-small">Loading returns…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-lead">{returns.length === 0 ? 'No return requests yet.' : 'No returns match this view.'}</p>
          <p className="text-small">
            {returns.length === 0
              ? isAdmin === false
                ? "Your account isn't flagged as admin in profiles.role, so the RLS policy correctly shows you nothing. Promote your account per supabase/SETUP.md §11, then sign out and back in."
                : "No customer has submitted a return request against this project yet — place a delivered test order, then submit a return from /login, to see it here."
              : 'Try a different search term or status filter.'}
          </p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Order #</th>
                <th scope="col">Customer</th>
                <th scope="col">Product</th>
                <th scope="col">Size</th>
                <th scope="col">Reason</th>
                <th scope="col">Requested</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ret) => {
                const isSaving = savingId === ret.id
                const canDecide = ret.status === 'requested'
                const canStartPickup = ret.status === 'approved'
                const canMarkReceived = ret.status === 'pickup'
                const canStartInspection = ret.status === 'received'
                const canDecideInspection = ret.status === 'inspection'
                // The button stays visible while a previous attempt is
                // 'processing' too (isSaving already disables it) or
                // 'failed' (so the admin can retry) — only 'refunded'
                // status itself hides it, same as every other action here.
                const canInitiateRefund = ret.status === 'refund_pending'
                return (
                  <tr key={ret.id}>
                    <td>#{ret.orderId.slice(0, 8).toUpperCase()}</td>
                    <td>
                      {ret.customerName || 'Guest'}
                      {ret.customerEmail && (
                        <>
                          <br />
                          <span className="text-small">{ret.customerEmail}</span>
                        </>
                      )}
                      {ret.paymentMethod === 'cod' && (
                        <>
                          <br />
                          <span className="admin-badge admin-badge--neutral">COD</span>
                          {ret.customerPhone && <span className="text-small"> {ret.customerPhone}</span>}
                        </>
                      )}
                    </td>
                    <td>
                      {ret.productName ? (
                        <div className="admin-order-item">
                          <OrderItemThumb src={ret.imageUrl} alt={ret.productName} />
                          <span>{ret.productName}</span>
                        </div>
                      ) : (
                        <>
                          <div className="text-small">Whole order (no item specified)</div>
                          {ret.orderItems.map((item) => (
                            <div key={item.id} className="admin-order-item text-small">
                              <OrderItemThumb src={item.imageUrl} alt={item.productName} />
                              <span>
                                {item.quantity}× {item.productName}
                                {item.size ? ` (${item.size})` : ''}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </td>
                    <td>{ret.size || '—'}</td>
                    <td>
                      {ret.reason}
                      {ret.customerNote && (
                        <>
                          <br />
                          <span className="text-small">"{ret.customerNote}"</span>
                        </>
                      )}
                      {ret.status === 'rejected' && ret.rejectionReason && (
                        <>
                          <br />
                          <span className="text-small">Rejection reason: "{ret.rejectionReason}"</span>
                        </>
                      )}
                    </td>
                    <td>{formatDate(ret.requestedAt)}</td>
                    <td>
                      <StatusBadge status={ret.status} />
                      {ret.status === 'received' && ret.receivedAt && (
                        <>
                          <br />
                          <span className="text-small">{formatDate(ret.receivedAt)}</span>
                        </>
                      )}
                      {ret.status === 'inspection' && ret.inspectionStartedAt && (
                        <>
                          <br />
                          <span className="text-small">{formatDate(ret.inspectionStartedAt)}</span>
                        </>
                      )}
                      {ret.status === 'refund_pending' && ret.refundStatus === 'failed' && ret.refundFailureReason && (
                        <>
                          <br />
                          <span className="text-small">Refund failed: "{ret.refundFailureReason}"</span>
                        </>
                      )}
                      {ret.status === 'refunded' && (
                        <>
                          {ret.refundedAt && (
                            <>
                              <br />
                              <span className="text-small">{formatDateTime(ret.refundedAt)}</span>
                            </>
                          )}
                          {ret.refundAmount != null && <span className="text-small"> · ₹{ret.refundAmount}</span>}
                          {ret.refundId && (
                            <>
                              <br />
                              <span className="text-small">
                                {ret.refundId.startsWith('manual:')
                                  ? `Transfer ref: ${ret.refundId.slice('manual:'.length)}`
                                  : `Refund ID: ${ret.refundId}`}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <div className="admin-order-actions">
                        {canDecide && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => handleApprove(ret)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn admin-btn-danger admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => setRejectTarget(ret)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {canStartPickup && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => handleStartPickup(ret)}
                          >
                            Start Return Pickup
                          </button>
                        )}
                        {canMarkReceived && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => handleMarkReceived(ret)}
                          >
                            Mark as Received
                          </button>
                        )}
                        {canStartInspection && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => handleStartInspection(ret)}
                          >
                            Start Inspection
                          </button>
                        )}
                        {canDecideInspection && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => handlePassInspection(ret)}
                            >
                              Inspection Passed
                            </button>
                            <button
                              type="button"
                              className="btn admin-btn-danger admin-order-actions__btn"
                              disabled={isSaving}
                              onClick={() => setInspectionFailTarget(ret)}
                            >
                              Inspection Failed
                            </button>
                          </>
                        )}
                        {canInitiateRefund && ret.paymentMethod === 'cod' && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => setCodRefundTarget(ret)}
                          >
                            Record COD Refund
                          </button>
                        )}
                        {canInitiateRefund && ret.paymentMethod !== 'cod' && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => handleInitiateRefund(ret)}
                          >
                            {ret.refundStatus === 'failed' ? 'Retry Refund' : 'Initiate Refund'}
                          </button>
                        )}
                        {isSaving && <span className="text-small">Saving…</span>}
                        {savedId === ret.id && !isSaving && <span className="text-small">Saved</span>}
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
      />

      <RejectReturnDialog
        open={Boolean(codRefundTarget)}
        returnRequest={codRefundTarget}
        saving={Boolean(codRefundTarget) && savingId === codRefundTarget.id}
        onConfirm={confirmCodRefund}
        onCancel={() => setCodRefundTarget(null)}
        title="Record Cash on Delivery refund"
        descriptionSuffix="This was a cash order, so send the refund yourself by UPI or bank transfer (contact the customer for their UPI ID / account details), then enter the transfer reference below. The full order amount is recorded as refunded."
        fieldLabel="UPI / bank transfer reference"
        placeholder="e.g. UTR or UPI transaction ID"
        fieldErrorMessage="Enter the transfer reference so the refund can be recorded."
        cancelLabel="Not sent yet"
        confirmLabel="Mark refund sent"
        savingLabel="Saving…"
        confirmClassName="btn btn-primary"
      />

      <RejectReturnDialog
        open={Boolean(inspectionFailTarget)}
        returnRequest={inspectionFailTarget}
        saving={Boolean(inspectionFailTarget) && savingId === inspectionFailTarget.id}
        onConfirm={confirmFailInspection}
        onCancel={() => setInspectionFailTarget(null)}
        title="Mark this return as inspection failed?"
        descriptionSuffix="A reason is required — it's saved as the return's rejection reason and shown here once rejected."
        fieldLabel="Inspection failure reason"
        placeholder="e.g. Item shows signs of wear beyond normal use"
        fieldErrorMessage="Enter a reason so the inspection failure can be recorded."
        cancelLabel="Keep in inspection"
        confirmLabel="Fail inspection"
        savingLabel="Saving…"
      />
    </div>
  )
}

export default AdminReturns
