import { useEffect, useRef, useState } from 'react'
import {
  COMPOSITE_ERROR,
  CompositeError,
  toCompositeError,
} from './compositeErrors.js'

import {
  collectViewJobs,
} from './multiView.js'

import {
  renderPresentationJob,
} from './presentationRender.js'

import ExportControls from './ExportControls.jsx'
import { RESIZE_HANDLES } from '../artworkTransform.js'
import {
  layerBoxStyle,
  useLayerGestures,
} from '../useLayerGestures.js'

const SETTLE_MS = 200

/**
 * Load and cache an image.
 */
function loadImage(url, label, cache) {
  if (!url) {
    return Promise.resolve(null)
  }

  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image()

        img.onload = () => {
          if (img.naturalWidth > 0) {
            resolve(img)
          } else {
            reject(
              new CompositeError(
                COMPOSITE_ERROR.INVALID_IMAGE,
                `The ${label} decoded with no readable dimensions.`,
              ),
            )
          }
        }

        img.onerror = () => {
          reject(
            new CompositeError(
              COMPOSITE_ERROR.CORRUPTED_IMAGE,
              `The ${label} could not be decoded.`,
            )
          )
        }

        img.src = url
      }),
    )
  }

  return cache.get(url).catch((err) => {
    cache.delete(url)
    throw err
  })
}

/**
 * Final mockup preview.
 *
 * IMPORTANT:
 *
 * The preview uses the same presentation compositor as the
 * final export.
 *
 * The active view receives:
 *
 * 1. Original T-shirt photo
 *    - source of real fabric texture
 *    - folds
 *    - highlights
 *    - shadows
 *
 * 2. Background-removed T-shirt
 *    - visible garment
 *    - prevents the original background from returning
 *
 * 3. Custom/background studio background
 *
 * 4. Artwork
 *
 * This component itself does not modify source images.
 */
export default function CompositePreview({
  state,
  layers,
  selectedId = null,
  previewMode = false,
  onSelect,
  onTransform,
}) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const imageCache = useRef(new Map())

  const [status, setStatus] = useState({
    kind: 'idle',
    error: null,
  })

  const activeView =
    state?.composition?.activeView

  /**
   * Build the view jobs from the existing multi-view system.
   */
  const jobs = collectViewJobs(state)

  const baseJob =
    jobs.find(
      (item) =>
        item.view === activeView,
    ) ??
    jobs[0] ??
    null

  /**
   * IMPORTANT:
   *
   * Enrich the active render job with the live presentation state.
   *
   * This makes sure that changing:
   *
   * - background
   * - custom background image
   * - background removal
   * - T-shirt position
   * - shadow
   *
   * immediately affects the final preview.
   */
  const job = baseJob
    ? {
        ...baseJob,

        /**
         * Original photo.
         *
         * This must NEVER be replaced by processedUrl.
         * It is the photographic source used for
         * fabric/lighting information.
         */
        photoUrl:
          baseJob.photoUrl ??
          state?.sourceAssets?.tshirt
            ?.originalUrl ??
          null,

        /**
         * Background-removed garment.
         *
         * This is the visible T-shirt when
         * background removal is active.
         */
        processedPhotoUrl:
          state?.sourceAssets?.tshirt
            ?.processedUrl ??
          null,

        /**
         * Background studio state.
         */
        background:
          state?.composition?.background ??
          baseJob.background ??
          { mode: 'original' },

        /**
         * Uploaded custom background.
         */
        backgroundImageUrl:
          state?.sourceAssets
            ?.backgroundImage
            ?.sourceUrl ??
          baseJob.backgroundImageUrl ??
          null,

        /**
         * T-shirt presentation controls.
         */
        presentation:
          state?.composition
            ?.tshirtPresentation ??
          baseJob.presentation ??
          null,

        /**
         * Keep the current active view's
         * artwork placements.
         */
        layers:
          baseJob.layers ??
          [],
      }
    : null

  /**
   * The passed `layers` are used only by the
   * editor interaction overlay.
   *
   * The actual rendered image comes from `job`.
   */
  const visible =
    layers.filter(
      (layer) => layer.visible,
    )

  const interactive =
    !previewMode &&
    visible.length > 0 &&
    !!onSelect &&
    !!onTransform

  const selected =
    interactive
      ? visible.find(
          (layer) =>
            layer.id === selectedId,
        ) || null
      : null

  const { beginGesture } =
    useLayerGestures({
      getRect: () =>
        stageRef.current?.getBoundingClientRect(),

      disabled:
        !interactive,

      onSelect: (id) =>
        onSelect?.(id),

      onTransform: (
        id,
        patch,
      ) =>
        onTransform?.(
          id,
          patch,
        ),
    })

  /**
   * Any render-affecting change rebuilds
   * the preview.
   *
   * The original photo and processed photo
   * are intentionally both included.
   */
  const signature =
    JSON.stringify({
      activeView,

      tshirt:
        state?.sourceAssets?.tshirt
          ? {
              originalUrl:
                state.sourceAssets
                  .tshirt
                  .originalUrl,

              processedUrl:
                state.sourceAssets
                  .tshirt
                  .processedUrl,

              backgroundRemoved:
                state.sourceAssets
                  .tshirt
                  .backgroundRemoved,
            }
          : null,

      tshirtMask:
        state?.sourceAssets
          ?.tshirtMask?.url ??
        null,

      designMask:
        state?.sourceAssets
          ?.designMask?.url ??
        null,

      background:
        state?.composition
          ?.background ??
        null,

      backgroundImage:
        state?.sourceAssets
          ?.backgroundImage
          ? {
              sourceUrl:
                state.sourceAssets
                  .backgroundImage
                  .sourceUrl,
            }
          : null,

      presentation:
        state?.composition
          ?.tshirtPresentation ??
        null,

      artwork:
        state?.composition
          ?.surfaces ??
        null,
    })

  useEffect(() => {
    let cancelled = false
    let settleTimer = null

    const paint = async () => {
      if (!job) {
        if (!cancelled) {
          setStatus({
            kind: 'error',
            error:
              new CompositeError(
                COMPOSITE_ERROR.MISSING_PHOTO,
                'Upload a T-shirt photo for this view first.',
              ),
          })
        }

        return
      }

      try {
        /**
         * The presentation compositor handles:
         *
         * background
         * cutout
         * garment positioning
         * shadow
         * artwork
         * fabric integration
         */
        const result =
          await renderPresentationJob(
            job,
            {
              loadImage: (
                url,
                label,
              ) =>
                loadImage(
                  url,
                  label,
                  imageCache.current,
                ),

              scale: 1,
            },
          )

        if (cancelled) {
          return
        }

        const canvas =
          canvasRef.current

        if (!canvas) {
          return
        }

        /**
         * Copy rendered presentation
         * into the visible editor canvas.
         */
        canvas.width =
          result.width

        canvas.height =
          result.height

        const ctx =
          canvas.getContext(
            '2d',
          )

        ctx.clearRect(
          0,
          0,
          canvas.width,
          canvas.height,
        )

        ctx.drawImage(
          result.canvas,
          0,
          0,
        )

        /**
         * Release temporary canvas.
         */
        result.canvas.width = 0
        result.canvas.height = 0

        if (!cancelled) {
          setStatus({
            kind:
              job.layers.length === 0
                ? 'no-artwork'
                : 'ok',

            error: null,
          })
        }
      } catch (err) {
        if (cancelled) {
          return
        }

        setStatus({
          kind: 'error',
          error:
            toCompositeError(err),
        })
      }
    }

    /**
     * Draft render.
     */
    const frame =
      requestAnimationFrame(
        () => {
          paint().catch(
            (err) => {
              if (!cancelled) {
                setStatus({
                  kind: 'error',
                  error:
                    toCompositeError(
                      err,
                    ),
                })
              }
            },
          )
        },
      )

    /**
     * Settled render.
     *
     * This gives us a second clean render
     * after the user stops moving artwork.
     */
    settleTimer =
      window.setTimeout(
        () => {
          paint().catch(
            (err) => {
              if (!cancelled) {
                setStatus({
                  kind: 'error',
                  error:
                    toCompositeError(
                      err,
                    ),
                })
              }
            },
          )
        },
        SETTLE_MS,
      )

    return () => {
      cancelled = true

      cancelAnimationFrame(
        frame,
      )

      window.clearTimeout(
        settleTimer,
      )
    }

    // The complete render signature intentionally
    // controls the preview lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  let note = null

  if (
    status.kind === 'error' &&
    status.error
  ) {
    note =
      status.error.message
  } else if (
    status.kind ===
    'no-artwork'
  ) {
    note =
      'Add artwork to see it composited onto the T-shirt.'
  }

  return (
    <section
      className="mv2-composite"
      aria-label="Final mockup preview"
    >
      <h3 className="mv2-group__title">
        Final mockup preview
      </h3>

      {note && (
        <p
          className={`mv2-composite__note${
            status.kind ===
            'error'
              ? ' is-error'
              : ''
          }`}
          role={
            status.kind ===
            'error'
              ? 'alert'
              : 'status'
          }
        >
          {note}
        </p>
      )}

      {job && (
        <ExportControls
          state={state}
        />
      )}

      <div
        ref={stageRef}
        className="mv2-composite__stage"
        onPointerDown={() => {
          if (interactive) {
            onSelect(null)
          }
        }}
        onDragStart={(event) =>
          event.preventDefault()
        }
      >
        <canvas
          ref={canvasRef}
          className="mv2-composite__canvas"
          aria-label="Final T-shirt mockup composition"
        />

        {interactive && (
          <div
            className="mv2-composite__overlay"
            data-ui-only="composite-selection"
          >
            {visible.map(
              (layer) => (
                <div
                  key={layer.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${layer.name}`}
                  aria-pressed={
                    layer.id ===
                    selectedId
                  }
                  className={`mv2-art${
                    layer.locked
                      ? ' is-locked'
                      : ''
                  }`}
                  style={layerBoxStyle(
                    layer,
                  )}
                  onPointerDown={(
                    event,
                  ) =>
                    beginGesture(
                      event,
                      layer,
                      'move',
                    )
                  }
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                        'Enter' ||
                      event.key ===
                        ' '
                    ) {
                      event.preventDefault()

                      onSelect(
                        layer.id,
                      )
                    }
                  }}
                />
              ),
            )}

            {selected && (
              <div
                className={`mv2-sel${
                  selected.locked
                    ? ' is-locked'
                    : ''
                }`}
                style={layerBoxStyle(
                  selected,
                )}
              >
                {!selected.locked && (
                  <>
                    <span className="mv2-sel__stem" />

                    <span
                      className="mv2-handle mv2-handle--rotate"
                      title="Rotate"
                      onPointerDown={(
                        event,
                      ) =>
                        beginGesture(
                          event,
                          selected,
                          'rotate',
                        )
                      }
                    />

                    {RESIZE_HANDLES.map(
                      (
                        handle,
                      ) => (
                        <span
                          key={
                            handle.key
                          }
                          className={`mv2-handle mv2-handle--${handle.key}`}
                          onPointerDown={(
                            event,
                          ) =>
                            beginGesture(
                              event,
                              selected,
                              'resize',
                              handle,
                            )
                          }
                        />
                      ),
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}