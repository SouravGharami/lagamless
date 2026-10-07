/**
 * LAGAMLESS Mockup Studio
 *
 * Gallery model
 *
 * Phase 1 update:
 * - Stores processed/background-removed T-shirt source
 * - Stores selected background configuration
 * - Stores uploaded custom background
 * - Stores T-shirt presentation settings
 * - Keeps Front / Back / other views isolated
 * - Keeps backward compatibility with older version-1 gallery records
 */

import { ANGLE_DEFS } from '../generation/mockupAngles.js'

export const VIEW_ORDER =
  ANGLE_DEFS.map((a) => a.id)

const SLUGS = {
  FRONT: 'front',
  THREE_QUARTER_FRONT: '3-4-front',
  SIDE: 'side',
  BACK: 'back',
  THREE_QUARTER_BACK: '3-4-back',
  DETAIL: 'detail',
}

export const viewRank = (view) => {
  const i =
    VIEW_ORDER.indexOf(view)

  return i === -1
    ? VIEW_ORDER.length
    : i
}

export const viewLabel = (view) =>
  ANGLE_DEFS.find(
    (a) => a.id === view
  )?.label ?? String(view)

export const viewSlug = (view) =>
  SLUGS[view] ??
  String(view)
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )

/**
 * Gallery order:
 * stored sort_order first, then fixed view order.
 */
export function sortMockups(list) {
  return [...list].sort(
    (a, b) =>
      (a.sortOrder ?? 0) -
        (b.sortOrder ?? 0) ||
      viewRank(a.viewType) -
        viewRank(b.viewType)
  )
}

export function planInsertOrder(
  existing,
  added
) {
  const sorted =
    sortMockups(existing)

  const at =
    sorted.findIndex(
      (m) =>
        viewRank(m.viewType) >
        viewRank(added.viewType)
    )

  const ids =
    sorted.map(
      (m) => m.id
    )

  ids.splice(
    at === -1
      ? ids.length
      : at,
    0,
    added.id
  )

  return ids
}

export function moveId(
  sortedIds,
  id,
  delta
) {
  const from =
    sortedIds.indexOf(id)

  if (from === -1) {
    return null
  }

  const to = Math.max(
    0,
    Math.min(
      sortedIds.length - 1,
      from + delta
    )
  )

  if (to === from) {
    return null
  }

  const next = [
    ...sortedIds,
  ]

  next.splice(
    from,
    1
  )

  next.splice(
    to,
    0,
    id
  )

  return next
}

export function nextMainAfterRemoval(
  list,
  removedId
) {
  const removed =
    list.find(
      (m) =>
        m.id === removedId
    )

  if (!removed?.isMain) {
    return null
  }

  return sortMockups(
    list.filter(
      (m) =>
        m.id !== removedId
    )
  )[0]?.id ?? null
}


// ============================================================
// PRODUCT IMAGE SLOTS
// ============================================================

export const PRODUCT_SLOT_FOR_VIEW = {
  FRONT: 'front',
  THREE_QUARTER_FRONT: 'model',
  SIDE: 'side',
  BACK: 'back',
  THREE_QUARTER_BACK:
    'three_quarter_back',
  DETAIL: 'detail',
}

export const PRODUCT_SLOT_LABELS = {
  main: 'Main',
  front: 'Front',
  model: '3/4 Front',
  side: 'Side',
  back: 'Back',
  three_quarter_back:
    '3/4 Back',
  detail: 'Detail',
}

export function destinationSlots(
  mockup
) {
  const own =
    PRODUCT_SLOT_FOR_VIEW[
      mockup.viewType
    ]

  const slots = [
    ...new Set(
      [
        mockup.isMain
          ? 'main'
          : own,
        own,
        'main',
      ].filter(Boolean)
    ),
  ]

  return slots.map(
    (key) => ({
      key,
      label:
        PRODUCT_SLOT_LABELS[
          key
        ] ?? key,
    })
  )
}


// ============================================================
// STORAGE PATHS
// ============================================================

export const mockupsPrefix =
  (productId) =>
    `mockups/${productId}/`

export const mockupImagePath = (
  productId,
  view,
  ext,
  stamp = Date.now()
) =>
  `${mockupsPrefix(productId)}${viewSlug(view)}/${stamp}.${ext}`

export const mockupSourcePath = (
  productId,
  hash,
  ext
) =>
  `${mockupsPrefix(productId)}sources/${hash}.${ext}`

export const isOwnedMockupPath = (
  productId,
  path
) =>
  typeof path ===
    'string' &&
  path.startsWith(
    mockupsPrefix(productId)
  ) &&
  !path.includes('..')

const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const extForType =
  (type) =>
    EXT[type] ?? 'png'


// ============================================================
// UPLOAD VALIDATION
// ============================================================

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

export const MAX_MOCKUP_BYTES =
  60 * 1024 * 1024

export const MIN_MOCKUP_SIDE =
  300

export function validateImageFile(
  file,
  {
    maxBytes =
      MAX_MOCKUP_BYTES,
  } = {}
) {
  if (!file) {
    return 'Choose an image first.'
  }

  if (
    !ACCEPTED_IMAGE_TYPES.includes(
      file.type
    )
  ) {
    return 'Use a PNG, JPEG or WebP image.'
  }

  if (!(file.size > 0)) {
    return 'That file is empty.'
  }

  if (
    file.size >
    maxBytes
  ) {
    return `That image is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${Math.round(maxBytes / 1048576)} MB.`
  }

  return null
}

export function validateDimensions(
  width,
  height
) {
  if (
    !(width > 0) ||
    !(height > 0)
  ) {
    return 'The image has no readable size — it may be corrupted.'
  }

  if (
    Math.min(
      width,
      height
    ) < MIN_MOCKUP_SIDE
  ) {
    return `The image is ${width}×${height}px; each side must be at least ${MIN_MOCKUP_SIDE}px.`
  }

  return null
}


// ============================================================
// RENDER CONFIGURATION
// ============================================================

const LAYER_KEYS = [
  'id',
  'name',
  'groupId',
  'view',
  'surface',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scale',
  'opacity',
  'realism',
  'warp',
  'visible',
  'locked',
  'aspectLocked',
]

/**
 * Create the durable configuration needed to regenerate a mockup.
 *
 * Version 2 adds:
 *
 * - processedPhotoPath
 * - background
 * - backgroundImagePath
 * - presentation
 */
export function buildRenderConfig(
  job,
  pathOf
) {
  if (!job) {
    throw new Error(
      'Cannot build gallery render configuration without a render job.'
    )
  }

  const need = (
    url,
    what
  ) => {
    if (!url) {
      return null
    }

    const path =
      pathOf(url)

    if (!path) {
      throw new Error(
        `The ${what} was not stored, so this mockup could not be made regenerable.`
      )
    }

    return path
  }

  const layers =
    (job.layers ?? []).map(
      (layer) => {
        const output =
          Object.fromEntries(
            LAYER_KEYS
              .filter(
                (key) =>
                  layer[key] !==
                  undefined
              )
              .map(
                (key) => [
                  key,
                  layer[key],
                ]
              )
          )

        output.sourcePath =
          need(
            layer.sourceUrl,
            `artwork "${layer.name ?? 'Artwork'}"`
          )

        return output
      }
    )

  return {
    version: 2,

    /*
     * The exact camera view this configuration belongs to.
     *
     * This prevents Front configuration from being regenerated
     * as Back.
     */
    view: job.view,
    label: job.label,

    /*
     * Original photograph.
     *
     * Required because masks are authored in this coordinate system.
     */
    photo: {
      path: need(
        job.photoUrl,
        'T-shirt photo'
      ),
      width:
        job.photo?.width ??
        null,
      height:
        job.photo?.height ??
        null,
    },

    /*
     * Transparent/background-removed garment.
     */
    processedPhotoPath:
      job.processedPhotoUrl
        ? need(
            job.processedPhotoUrl,
            'background-removed T-shirt'
          )
        : null,

    /*
     * Preserve whether background removal was active.
     */
    backgroundRemoved:
      Boolean(
        job.backgroundRemoved
      ),

    /*
     * Existing masks.
     */
    tshirtMaskPath:
      job.tshirtMaskUrl
        ? need(
            job.tshirtMaskUrl,
            'T-shirt mask'
          )
        : null,

    designMaskPath:
      job.designMaskUrl
        ? need(
            job.designMaskUrl,
            'design mask'
          )
        : null,

    /*
     * Background Studio configuration.
     *
     * This is JSON-safe because we only store settings,
     * never a Blob object.
     */
    background: {
      ...(job.background
        ? {
            ...job.background,
          }
        : {
            mode: 'original',
          }),

      image:
        job.backgroundImageUrl
          ? {
              sourcePath:
                need(
                  job.backgroundImageUrl,
                  'custom background image'
                ),
            }
          : null,
    },

    /*
     * T-shirt presentation:
     * position, scale, shadow, etc.
     */
    presentation:
      job.presentation
        ? {
            ...job.presentation,
          }
        : null,

    /*
     * Only this camera view's artwork is saved.
     */
    layers,
  }
}


/**
 * Return every stored source required to regenerate this configuration.
 */
export const configSourcePaths = (
  config
) => {
  const paths = [
    config?.photo?.path,
    config?.processedPhotoPath,
    config?.tshirtMaskPath,
    config?.designMaskPath,
    config?.background?.image
      ?.sourcePath,

    ...(config?.layers ?? [])
      .map(
        (layer) =>
          layer.sourcePath
      ),
  ]

  return [
    ...new Set(
      paths.filter(Boolean)
    ),
  ]
}


// ============================================================
// STORED CONFIG -> RENDER JOB
// ============================================================

/**
 * Convert a saved gallery configuration back into the same render-job
 * structure consumed by finalRender.js / presentationRender.js.
 *
 * Version 1 records remain supported.
 */
export function resolveRenderJob(
  config,
  urlFor
) {
  if (!config) {
    throw new Error(
      'The saved mockup has no render configuration.'
    )
  }

  const isV2 =
    config.version >= 2

  const backgroundImagePath =
    isV2
      ? config.background
          ?.image
          ?.sourcePath
      : null

  return {
    view:
      config.view,

    label:
      config.label,

    photoUrl:
      urlFor(
        config.photo.path
      ),

    processedPhotoUrl:
      isV2 &&
      config.processedPhotoPath
        ? urlFor(
            config.processedPhotoPath
          )
        : null,

    backgroundRemoved:
      isV2
        ? Boolean(
            config.backgroundRemoved
          )
        : false,

    photo: {
      width:
        config.photo.width,
      height:
        config.photo.height,
    },

    tshirtMaskUrl:
      config.tshirtMaskPath
        ? urlFor(
            config.tshirtMaskPath
          )
        : null,

    designMaskUrl:
      config.designMaskPath
        ? urlFor(
            config.designMaskPath
          )
        : null,

    background:
      isV2
        ? {
            ...(config.background ??
              {
                mode:
                  'original',
              }),
          }
        : {
            mode:
              'original',
          },

    backgroundImageUrl:
      backgroundImagePath
        ? urlFor(
            backgroundImagePath
          )
        : null,

    presentation:
      isV2
        ? {
            ...(config.presentation ??
              {}),
          }
        : {},

    layers: (
      config.layers ??
      []
    ).map(
      ({
        sourcePath,
        ...rest
      }) => ({
        ...rest,
        sourceUrl:
          urlFor(
            sourcePath
          ),
        visible:
          rest.visible !==
          false,
        locked:
          Boolean(
            rest.locked
          ),
      })
    ),
  }
}


/**
 * Version 1 and version 2 gallery records can both be regenerated.
 */
export const isRegenerable =
  (mockup) =>
    Boolean(
      (
        mockup?.renderConfig
          ?.version === 1 ||
        mockup?.renderConfig
          ?.version === 2
      ) &&
      mockup.renderConfig
        .layers?.length &&
      mockup.renderConfig
        .photo?.path
    )


// ============================================================
// DB ROW -> UI SHAPE
// ============================================================

export const mapMockupRow =
  (r) => ({
    id: r.id,
    productId:
      r.product_id,
    viewType:
      r.view_type,
    imagePath:
      r.image_path,
    imageUrl:
      r.image_url,
    width:
      r.width,
    height:
      r.height,
    isMain:
      r.is_main,
    sortOrder:
      r.sort_order,
    origin:
      r.origin,
    renderConfig:
      r.render_config ??
      null,
    sourcePaths:
      r.source_paths ??
      [],
    createdAt:
      r.created_at,
    updatedAt:
      r.updated_at,
  })


export async function hashBlob(
  blob
) {
  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      await blob.arrayBuffer()
    )

  return [
    ...new Uint8Array(
      digest
    ),
  ]
    .map(
      (b) =>
        b
          .toString(16)
          .padStart(2, '0')
    )
    .join('')
    .slice(0, 40)
}