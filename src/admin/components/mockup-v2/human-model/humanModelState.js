/**
 * Human Model Studio — state model (Step 1: UI / state foundation only).
 *
 * Nothing here talks to a backend, a provider or storage. There is deliberately NO generation
 * code: the job/result shapes below only describe what a later step will fill in.
 *
 * Owned by useHumanModel() (see useHumanModel.js), which the launcher keeps alive next to the
 * Mockup Studio reducer. The finished T-shirt is NOT stored here — it is read from the existing
 * Mockup Studio state through finishedComposition.js.
 */

/* ---------------------------------------------------------------- views */

export const MODEL_VIEW_TYPES = Object.freeze({
  FRONT: 'front',
  THREE_QUARTER_FRONT: 'three_quarter_front',
  SIDE: 'side',
  BACK: 'back',
  THREE_QUARTER_BACK: 'three_quarter_back',
  DETAIL: 'detail',
})

export const MODEL_VIEW_DEFS = Object.freeze([
  { id: 'front', label: 'Front', hint: 'Straight-on, front of the T-shirt' },
  { id: 'three_quarter_front', label: '3/4 Front', hint: 'Turned slightly, front and one sleeve' },
  { id: 'side', label: 'Side', hint: 'Profile, sleeve focus' },
  { id: 'back', label: 'Back', hint: 'Straight-on, back of the T-shirt' },
  { id: 'three_quarter_back', label: '3/4 Back', hint: 'Turned slightly, back and one sleeve' },
  { id: 'detail', label: 'Detail', hint: 'Close-up of the print' },
].map(Object.freeze))

export const DEFAULT_MODEL_VIEW_TYPES = Object.freeze(['front', 'three_quarter_front', 'back'])

export const isModelViewType = (id) => MODEL_VIEW_DEFS.some((v) => v.id === id)

/** Maps a model view to the existing Mockup Studio angle id (generation/mockupAngles.js) it is built from. */
export const MODEL_VIEW_TO_ANGLE = Object.freeze({
  front: 'FRONT',
  three_quarter_front: 'THREE_QUARTER_FRONT',
  side: 'SIDE',
  back: 'BACK',
  three_quarter_back: 'THREE_QUARTER_BACK',
  detail: 'DETAIL',
})

/** Keeps definition order and drops unknown / duplicate ids. */
function normalizeViews(ids) {
  const wanted = new Set(ids)
  return MODEL_VIEW_DEFS.filter((v) => wanted.has(v.id)).map((v) => v.id)
}

/* ------------------------------------------------------- generation job */

export const JOB_STATUS = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  PREPARING: 'preparing',
  UPLOADING: 'uploading',
  GENERATING: 'generating',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
})

export const JOB_STATUS_LABELS = Object.freeze({
  idle: 'Waiting for a model image and a finished T-shirt',
  ready: 'Ready — model and finished T-shirt are set',
  preparing: 'Preparing',
  uploading: 'Uploading',
  generating: 'Generating',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
})

/** Future generation job. No field is invented: everything is null / empty until a provider exists. */
export function createGenerationJob(requestedViews = DEFAULT_MODEL_VIEW_TYPES) {
  return {
    jobId: null,
    providerId: null,
    status: JOB_STATUS.IDLE,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    requestedViews: normalizeViews(requestedViews),
    completedViews: [],
    results: [],
  }
}

/**
 * The job status to SHOW. `ready` is derived (idle + both sources present), never stored, so it
 * can't go stale when the admin removes the model image or edits the T-shirt.
 */
export function effectiveJobStatus(job, sourcesReady) {
  return job.status === JOB_STATUS.IDLE && sourcesReady ? JOB_STATUS.READY : job.status
}

/* --------------------------------------------------------------- result */

/** Future generated model image. Only supplied fields are set; the rest stay null (never invented). */
export function createModelResult(fields = {}) {
  return {
    id: fields.id ?? null,
    viewType: isModelViewType(fields.viewType) ? fields.viewType : null,
    status: fields.status ?? null,
    imageUrl: fields.imageUrl ?? null,
    storagePath: fields.storagePath ?? null,
    width: fields.width ?? null,
    height: fields.height ?? null,
    createdAt: fields.createdAt ?? null,
    providerId: fields.providerId ?? null,
    generationJobId: fields.generationJobId ?? null,
    promptVersion: fields.promptVersion ?? null,
    sourceModelId: fields.sourceModelId ?? null,
    sourceCompositionId: fields.sourceCompositionId ?? null,
    isApproved: fields.isApproved === true,
    isMain: fields.isMain === true,
    sortOrder: Number.isFinite(fields.sortOrder) ? fields.sortOrder : null,
  }
}

/* ---------------------------------------------------------------- state */

export const FIT_READY_MESSAGE = 'Human model and finished T-shirt are ready for AI fitting.'

/** Blob URLs owned by a finished-T-shirt snapshot (its rendered images). Source photo URLs belong to the studio. */
export function snapshotRenderUrls(snapshot) {
  return Object.values(snapshot?.renderedComposition ?? {}).map((r) => r.url).filter(Boolean)
}

export function createInitialHumanModelState() {
  return {
    // HumanModelAsset (see humanModelAsset.js): id, fileName, mimeType, width, height, fileSize, previewUrl, sourceUrl (blob: object URLs),
    // validation, quality, file, metadata. The image stays in the browser; its URLs are released by useHumanModel().
    modelImage: null,
    modelViewType: [...DEFAULT_MODEL_VIEW_TYPES],
    // STEP 2: finished T-shirt handed over from Mockup Studio (see finishedTshirtSnapshot.js). Read-only here.
    tshirtSnapshot: null,
    snapshotStatus: 'idle', // 'idle' | 'preparing' | 'ready' | 'failed'
    snapshotRequestId: 0, // guards against an older render finishing after a newer one
    snapshotError: null, // { message, details[] }
    job: createGenerationJob(DEFAULT_MODEL_VIEW_TYPES),
    notice: null,
    preparedInput: null, // summary of the last assembled (never sent) generation input
  }
}

export function humanModelReducer(state, action) {
  switch (action.type) {
    // The asset is built (id, validation, quality) OUTSIDE the reducer so the reducer stays pure.
    case 'SET_MODEL_IMAGE':
      if (!action.asset?.sourceUrl) return state
      return { ...state, modelImage: action.asset, notice: null, preparedInput: null }

    case 'CLEAR_MODEL_IMAGE':
      return { ...state, modelImage: null, notice: null, preparedInput: null }

    case 'TOGGLE_MODEL_VIEW': {
      if (!isModelViewType(action.view)) return state
      const has = state.modelViewType.includes(action.view)
      const next = normalizeViews(has ? state.modelViewType.filter((v) => v !== action.view) : [...state.modelViewType, action.view])
      return { ...state, modelViewType: next, job: { ...state.job, requestedViews: next } }
    }

    case 'SNAPSHOT_STARTED':
      return { ...state, snapshotStatus: 'preparing', snapshotError: null, snapshotRequestId: action.requestId, notice: null }

    // The previous snapshot is kept until a new one is ready (or the new one fails, which keeps the old one visible as-is).
    case 'SNAPSHOT_READY':
      if (action.requestId !== state.snapshotRequestId) return state
      return { ...state, tshirtSnapshot: action.snapshot, snapshotStatus: 'ready', snapshotError: null, notice: null }

    case 'SNAPSHOT_FAILED':
      if (action.requestId !== state.snapshotRequestId) return state
      return { ...state, snapshotStatus: state.tshirtSnapshot ? 'ready' : 'failed', snapshotError: { message: action.message, details: action.details ?? [], failures: action.failures ?? [] } }

    case 'CLEAR_SNAPSHOT':
      return { ...state, tshirtSnapshot: null, snapshotStatus: 'idle', snapshotError: null, snapshotRequestId: state.snapshotRequestId + 1, notice: null }

    // The CTA. There is no provider: this only records that the input is assembled. The caller validated it.
    case 'FIT_STARTED':
      return {
        ...state,
        notice: action.message ?? 'Starting FASHN VTON…',
        preparedInput: null,
        job: { ...state.job, status: JOB_STATUS.GENERATING, startedAt: Date.now(), completedAt: null, errorCode: null, errorMessage: null },
      }

    case 'FIT_STATUS':
      return {
        ...state,
        notice: action.message ?? state.notice,
        job: { ...state.job, status: action.status ?? JOB_STATUS.PROCESSING },
      }

    case 'FIT_REQUESTED':
      if (!action.ok) return { ...state, notice: action.summary ?? null, job: { ...state.job, status: JOB_STATUS.FAILED, errorMessage: action.summary ?? null } }
      return {
        ...state,
        notice: FIT_READY_MESSAGE,
        preparedInput: action.summary ?? null,
        job: {
          ...state.job,
          status: action.status ?? JOB_STATUS.COMPLETED,
          completedAt: Date.now(),
          errorCode: action.errorCode ?? null,
          errorMessage: action.errorMessage ?? null,
        },
      }

    case 'CLEAR_MODEL_NOTICE':
      return { ...state, notice: null }

    default:
      return state
  }
}
