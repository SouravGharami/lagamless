import { useEffect, useMemo, useRef, useState } from 'react'
import ArtworkPanel from './ArtworkPanel.jsx'
import MockupCanvas from './MockupCanvas.jsx'
import AnglePhotoManager from './AnglePhotoManager.jsx'
import { ANGLES, FABRIC_TYPES, getZone, getPrintZones, zoneGeometry } from '../../lib/mockupTemplates.js'
import {
  analyzeArtwork,
  suggestPlacement,
  placementAtZone,
  duplicatePlacement,
  reorderPlacement,
  nextId,
} from '../../lib/mockupPlacement.js'
import { generateMockupFiles } from '../../lib/mockupExport.js'
import { getTemplatePhoto, setTemplatePhoto, colorKeyFor } from '../../lib/templatePhotoStore.js'
import { saveArtwork, getArtwork, removeArtwork } from '../../lib/artworkStore.js'
import { loadImage } from '../../lib/photoCompositor.js'
import { removeBackground, compositeOnBackdrop, compositeOnCustomBackground, STUDIO_BACKDROPS, HANGER_STYLES, DEFAULT_HANGER } from '../../lib/backgroundStudio.js'

const DEFAULT_SUBJECT_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0 }
const DEFAULT_BG_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0 }

const TEMPLATE_ID = 'oversized-crew'
const DEFAULT_GARMENT = { hex: '#e4ded0', fabric: 'solid', colorName: 'Default' }

/** Human labels for the gallery, keyed by the product-image slot each generated file fills. */
const GALLERY_LABELS = {
  main: 'Front',
  front: 'Front',
  model: '3/4 Front',
  side: 'Side',
  back: 'Back',
  three_quarter_back: '3/4 Back',
  detail: 'Detail',
  fabric: 'Fabric swatch',
}

/**
 * Print Placement & Mockup Studio — photographic.
 *
 * Upload DTF artwork → automatic shape analysis → smart placement
 * suggestion → admin accepts/changes it → drag/resize/rotate/perspective,
 * any number of prints on the same garment → choose color/fabric → the
 * garment itself is always a real, uploaded photograph (recolored for a
 * solid fabric, or its own dedicated photo for acid-wash/tie-dye/etc.) →
 * generate front/back/3-4-front/etc. mockups → review → the generated
 * PNGs land straight in the product's existing image slots below.
 *
 * @param {object} props
 * @param {Array<{name:string, hex:string}>} props.colors - the product's Colors section
 * @param {object|null} props.initialConfig - a previously-saved `{ garment, placements }`, if editing
 * @param {string} props.fileStem
 * @param {(files: Record<string, File>, config: { garment: object, placements: Array }) => void} props.onGenerate
 */
function MockupStudio({ colors, initialConfig, fileStem, onGenerate }) {
  // Reopening a product: geometry (x/y/width/height/rotation/corners/
  // angle/artworkId/layer) always comes back from initialConfig.placements
  // as-is (see ProductForm's mockupConfig). The artwork IMAGE for each
  // placement, though, has to be rehydrated from artworkStore.js — try
  // that here before falling back to asking for a re-upload, so a print
  // really does "appear exactly where I left it" without extra steps.
  const [artworks, setArtworks] = useState(() => {
    const ids = [...new Set((initialConfig?.placements || []).map((p) => p.artworkId))]
    return ids.map((id) => getArtwork(id)).filter(Boolean)
  })
  const [placements, setPlacements] = useState(initialConfig?.placements || [])
  const [garment, setGarment] = useState(
    initialConfig?.garment ||
      (colors?.[0]?.hex ? { hex: colors[0].hex, fabric: 'solid', colorName: colors[0].name } : DEFAULT_GARMENT),
  )
  const [activeAngle, setActiveAngle] = useState('front')
  const [selectedId, setSelectedId] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // Background-removal + studio-backdrop review flow (see
  // handleTemplatePhotoUpload / beginBackgroundReview below). `bgReview`
  // holds everything needed to preview and re-preview different
  // backdrops BEFORE committing anything to templatePhotoStore — nothing
  // is saved until the admin confirms.
  const [bgWorking, setBgWorking] = useState(false)
  const [bgProgress, setBgProgress] = useState(0)
  const [bgReview, setBgReview] = useState(null)
  // Set when removeBackground() itself fails (offline on first model
  // download, unsupported browser, odd image, etc.) — holds everything
  // needed to either retry the SAME upload or explicitly fall back to
  // the original photo. Previously this case silently saved the raw
  // photo and only mentioned it in the scroll-to-top banner, which read
  // as a minor caveat rather than "the background was never removed" —
  // an admin who didn't immediately connect that banner to the busy
  // photo background they saw seconds later in the mockup gallery had no
  // obvious way back into background removal for that photo (only
  // "Change background", worded as if a background had already been
  // chosen). Now failure is a real fork in the road: nothing is saved
  // until the admin explicitly picks Retry or Use original background.
  const [bgFailure, setBgFailure] = useState(null)
  // Toggle for the review step's Before/After comparison — false shows the
  // committed preview (cutout on the chosen backdrop), true shows the raw
  // upload as-is, so the admin can actually SEE what background removal
  // did rather than just trusting it happened.
  const [bgShowBefore, setBgShowBefore] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  // Every setError/setNote call in this component happens close to the
  // control that triggered it (a button deep inside the two-column
  // layout below), but the banner itself renders up here, at the very
  // TOP of .mockup-studio — well above the artwork panel and canvas once
  // scrolled down to them. Without this, a guardrail like handlePlace's
  // "upload a template photo for that angle first" fires silently from
  // the admin's point of view: the click visibly does nothing (the tab
  // just switches), and the actual explanation is scrolled out of sight.
  // Scroll it into view every time either banner appears, from ANY
  // handler — not just one — so this class of "the button did nothing"
  // report can't recur elsewhere the same way it did for Generate.
  const feedbackRef = useRef(null)
  useEffect(() => {
    if (error || note) feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [error, note])
  const [previewUrls, setPreviewUrls] = useState(null)
  const [photoVersion, setPhotoVersion] = useState(0)
  // Undo/redo history for placements only (add/move/resize/rotate/
  // duplicate/delete/reorder/reset) — see pushHistory. Deliberately does
  // NOT cover artwork uploads or garment/fabric choices; the brief scopes
  // undo/redo to "safely experiment with placement".
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const [restoredNotice, setRestoredNotice] = useState(() => {
    const initialPlacements = initialConfig?.placements || []
    if (!initialPlacements.length) return null
    const ids = [...new Set(initialPlacements.map((p) => p.artworkId))]
    const missing = ids.filter((id) => !getArtwork(id))
    if (!missing.length) return `Restored ${initialPlacements.length} saved print(s) exactly where you left them.`
    return `Restored ${initialPlacements.length} saved print(s) — ${missing.length} artwork file(s) couldn't be found in this browser's storage; re-upload the matching DTF file(s) below to bring those back.`
  })

  const colorKey = colorKeyFor(garment)

  const artworksById = useMemo(() => {
    const byId = Object.fromEntries(artworks.map((a) => [a.id, a]))
    for (const p of placements) {
      if (!byId[p.artworkId] && p.artworkName) {
        const match = artworks.find((a) => a.name === p.artworkName)
        if (match) byId[p.artworkId] = match
      }
    }
    return byId
  }, [artworks, placements])

  // Snapshot the CURRENT placements onto the undo stack and clear redo.
  // Called at the start of every drag gesture (via MockupCanvas's
  // onDragStart) and before every discrete placement action below — never
  // called from inside a continuous onChange, so one whole drag/action is
  // one undo step, not one per pixel or keystroke.
  function pushHistory() {
    setPast((prev) => [...prev, placements])
    setFuture([])
  }

  function handleUndo() {
    if (!past.length) return
    const previous = past[past.length - 1]
    setFuture((f) => [placements, ...f])
    setPast((p) => p.slice(0, -1))
    setPlacements(previous)
    setSelectedId(null)
  }

  function handleRedo() {
    if (!future.length) return
    const next = future[0]
    setPast((p) => [...p, placements])
    setFuture((f) => f.slice(1))
    setPlacements(next)
    setSelectedId(null)
  }

  async function handleUpload(fileList) {
    setError(null)
    setAnalyzing(true)
    try {
      const files = Array.from(fileList)
      const analyzed = await Promise.all(
        files.map(async (file) => {
          const meta = await analyzeArtwork(file)
          return {
            id: nextId('art'),
            name: file.name,
            ...meta,
            suggestion: suggestPlacement(meta, 'front'),
          }
        }),
      )
      // Original DTF file is never modified — this only PERSISTS the exact
      // uploaded data URL (see artworkStore.js) so it survives a reload;
      // it's the same untouched bytes the editor reads from from then on.
      analyzed.forEach(saveArtwork)
      setArtworks((prev) => [...prev, ...analyzed])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that artwork file.')
    } finally {
      setAnalyzing(false)
    }
  }

  /**
   * Persists the CURRENT bgReview preview to templatePhotoStore, exactly
   * like clicking "Use this background" — pulled out so it can also run
   * automatically from handlePlace/handleGenerate (see ROOT CAUSE NOTE
   * below), not just from that button's own onClick.
   */
  function commitBackgroundReview(review) {
    setTemplatePhoto(TEMPLATE_ID, review.angle, review.colorKey, {
      dataUrl: review.previewUrl,
      width: review.width,
      height: review.height,
      rawDataUrl: review.rawDataUrl,
      cutoutDataUrl: review.cutoutDataUrl,
      backdropKind: review.backdropKind,
      backdropId: review.backdropId,
      customBackgroundDataUrl: review.customBackgroundDataUrl,
      bgTransform: review.bgTransform,
      subjectTransform: review.subjectTransform,
      gradientColors: review.gradientColors,
      hanger: review.hanger,
    })
    setPhotoVersion((v) => v + 1)
  }

  // ROOT CAUSE NOTE ("Add to garment"/"Generate mockups" still doing
  // nothing): requiring a SEPARATE, easy-to-miss "Use this background"
  // click before either button would do anything was the actual bug being
  // reported — from the admin's side, they'd uploaded a photo, seen a
  // perfectly good preview of it, and clicking Add to garment right there
  // still did nothing but scroll up to a banner. The two steps are now
  // one: if a background review is sitting open for the angle a print is
  // about to land on (or for ANY open review, right before generating —
  // whatever's currently previewed is what the admin wants), it's saved
  // automatically with whatever's currently shown, exactly as if they'd
  // clicked "Use this background" themselves, and the action they actually
  // clicked just proceeds. The explicit button still exists for anyone who
  // wants to lock in a background before moving on to prints.
  function handlePlace(artworkId, areaHint) {
    const artwork = artworksById[artworkId]
    if (!artwork) return
    const suggestion = suggestPlacement(artwork, areaHint)
    const photoColorKey = garment.fabric === 'solid' ? 'solid' : colorKey
    if (bgReview && bgReview.angle === suggestion.angle && bgReview.colorKey === photoColorKey) {
      commitBackgroundReview(bgReview)
      setBgReview(null)
    }
    const record = getTemplatePhoto(TEMPLATE_ID, suggestion.angle, photoColorKey)
    if (!record) {
      setError(
        `Upload a real template photo for the "${suggestion.angle}" angle` +
          (garment.fabric !== 'solid' ? ` in "${colorKey}"` : '') +
          ' before placing a print there — switch to that tab and use "Upload template photo".',
      )
      setActiveAngle(suggestion.angle)
      return
    }
    const placement = placementAtZone({
      artwork,
      angle: suggestion.angle,
      zoneId: suggestion.zoneId,
      photoWidth: record.width,
      photoHeight: record.height,
      widthScale: suggestion.widthScale,
      rotation: suggestion.rotation,
    })
    pushHistory()
    setPlacements((prev) => [...prev, placement])
    setSelectedId(placement.id)
    setActiveAngle(suggestion.angle)
  }

  // Continuous updates (every pointermove frame of a drag, and the
  // opacity slider) — deliberately does NOT record history itself; the
  // one-entry-per-gesture snapshot already happened in pushHistory, fired
  // from MockupCanvas's onDragStart / the opacity input's onPointerDown.
  function handleChange(id, patch) {
    setPlacements((prev) => prev.map((p) => (p.id === id ? { ...patch } : p)))
  }

  function handleDelete(id) {
    pushHistory()
    setPlacements((prev) => prev.filter((p) => p.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
  }

  function handleDuplicate(id) {
    const source = placements.find((p) => p.id === id)
    if (!source) return
    const clone = duplicatePlacement(source)
    pushHistory()
    setPlacements((prev) => [...prev, clone])
    setSelectedId(clone.id)
  }

  function handleReorder(id, direction) {
    pushHistory()
    setPlacements((prev) => reorderPlacement(prev, id, direction))
  }

  function handleResetPosition(id) {
    pushHistory()
    setPlacements((prev) => prev.map((p) => (p.id === id && p.original ? { ...p, x: p.original.x, y: p.original.y } : p)))
  }

  function handleResetSize(id) {
    pushHistory()
    setPlacements((prev) =>
      prev.map((p) => (p.id === id && p.original ? { ...p, width: p.original.width, height: p.original.height } : p)),
    )
  }

  function handleResetRotation(id) {
    pushHistory()
    setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, rotation: 0 } : p)))
  }

  function handleResetArtwork(id) {
    pushHistory()
    setPlacements((prev) =>
      prev.map((p) =>
        p.id === id && p.original
          ? {
              ...p,
              x: p.original.x,
              y: p.original.y,
              width: p.original.width,
              height: p.original.height,
              rotation: p.original.rotation,
              corners: p.original.corners,
            }
          : p,
      ),
    )
  }

  function handleRemoveArtwork(artworkId) {
    removeArtwork(artworkId)
    setArtworks((prev) => prev.filter((a) => a.id !== artworkId))
    pushHistory()
    setPlacements((prev) => prev.filter((p) => p.artworkId !== artworkId))
  }

  function handleRezone(id, zoneId) {
    pushHistory()
    setPlacements((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const zone = getZone(p.angle, zoneId)
        const record = getTemplatePhoto(TEMPLATE_ID, p.angle, garment.fabric === 'solid' ? 'solid' : colorKey)
        if (!zone || !record) return p
        const geo = zoneGeometry(zone, record.width, record.height)
        const artwork = artworksById[p.artworkId]
        const width = geo.width
        const height = artwork ? width / artwork.aspectRatio : p.height
        // Re-zoning sets a NEW baseline: resetting this placement from now
        // on returns to the zone the admin just chose, not the very first
        // AI suggestion from before that choice.
        return {
          ...p,
          zoneId,
          x: geo.x,
          y: geo.y,
          width,
          height,
          rotation: geo.rotation,
          corners: geo.corners,
          original: { x: geo.x, y: geo.y, width, height, rotation: geo.rotation, corners: geo.corners },
        }
      }),
    )
  }

  // Runs the in-browser background-removal model on a real upload (or
  // reuses an already-cached cutout when re-editing an existing photo's
  // backdrop — see handleChangeBackground) and opens the backdrop-review
  // step. Nothing is written to templatePhotoStore until the admin picks
  // a backdrop and confirms (handleBgConfirm) or opts to keep the
  // original background as-is (handleBgKeepOriginal).
  async function beginBackgroundReview({
    angle,
    colorKey: photoColorKey,
    rawDataUrl,
    width,
    height,
    cachedCutoutDataUrl,
    initialBackdropKind = 'preset',
    initialBackdropId = STUDIO_BACKDROPS[0].id,
    initialCustomBackgroundDataUrl = null,
    initialBgTransform = DEFAULT_BG_TRANSFORM,
    initialSubjectTransform = DEFAULT_SUBJECT_TRANSFORM,
    initialGradientColors = null,
    initialHanger = DEFAULT_HANGER,
  }) {
    setBgWorking(true)
    setBgProgress(0)
    setBgShowBefore(false)
    setBgFailure(null)
    try {
      const cutoutDataUrl = cachedCutoutDataUrl || (await removeBackground(rawDataUrl, setBgProgress))
      const cutoutImage = await loadImage(cutoutDataUrl)
      const customBackgroundImage = initialCustomBackgroundDataUrl ? await loadImage(initialCustomBackgroundDataUrl) : null
      const bgTransform = { ...DEFAULT_BG_TRANSFORM, ...initialBgTransform }
      const subjectTransform = { ...DEFAULT_SUBJECT_TRANSFORM, ...initialSubjectTransform }
      const gradientDefault = STUDIO_BACKDROPS.find((b) => b.id === 'gradient')
      const gradientColors = initialGradientColors || { top: gradientDefault.top, bottom: gradientDefault.bottom }
      const hanger = { ...DEFAULT_HANGER, ...initialHanger }
      const previewCanvas =
        initialBackdropKind === 'custom' && customBackgroundImage
          ? compositeOnCustomBackground(cutoutImage, customBackgroundImage, bgTransform, subjectTransform, hanger)
          : compositeOnBackdrop(cutoutImage, initialBackdropId, subjectTransform, initialBackdropId === 'gradient' ? gradientColors : null, hanger)
      setBgReview({
        angle,
        colorKey: photoColorKey,
        rawDataUrl,
        width,
        height,
        cutoutDataUrl,
        cutoutImage,
        backdropKind: initialBackdropKind,
        backdropId: initialBackdropId,
        customBackgroundDataUrl: initialCustomBackgroundDataUrl,
        customBackgroundImage,
        bgTransform,
        subjectTransform,
        gradientColors,
        hanger,
        previewUrl: previewCanvas.toDataURL('image/png'),
      })
    } catch (err) {
      // Background removal is a free, best-effort in-browser model — it
      // can genuinely fail (offline on the first, one-time model
      // download; a browser without WASM/WebGPU support; an odd image).
      // Don't silently decide for the admin what happens next: surface
      // this as its own panel (rendered right next to the canvas, not
      // just the top-of-page banner) with a real choice — Retry, or
      // explicitly keep the original background — so it's never mistaken
      // for the feature having quietly done nothing.
      setError(`${err instanceof Error ? err.message : 'Background removal failed'}.`)
      setBgFailure({
        angle,
        colorKey: photoColorKey,
        rawDataUrl,
        width,
        height,
        message: err instanceof Error ? err.message : 'Background removal failed.',
      })
    } finally {
      setBgWorking(false)
    }
  }

  /** Retry the SAME upload's background removal after a failure (see bgFailure above). */
  function handleBgRetry() {
    if (!bgFailure) return
    const { angle, colorKey: photoColorKey, rawDataUrl, width, height } = bgFailure
    setBgFailure(null)
    setError(null)
    beginBackgroundReview({ angle, colorKey: photoColorKey, rawDataUrl, width, height })
  }

  /** Explicit, admin-chosen fallback after a background-removal failure — saves the photo exactly as uploaded, no cutout on file (so "Remove background" — see currentPhotoRecord below — stays offered instead of "Change background"). */
  function handleBgFailureUseOriginal() {
    if (!bgFailure) return
    const { angle, colorKey: photoColorKey, rawDataUrl, width, height } = bgFailure
    setTemplatePhoto(TEMPLATE_ID, angle, photoColorKey, { dataUrl: rawDataUrl, width, height, rawDataUrl })
    setPhotoVersion((v) => v + 1)
    setBgFailure(null)
    setError(null)
  }

  async function handleTemplatePhotoUpload(file, angleOverride) {
    const angle = angleOverride || activeAngle
    setError(null)
    setUploadingPhoto(true)
    try {
      const reader = new FileReader()
      const rawDataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('Could not read that image.'))
        reader.readAsDataURL(file)
      })
      const img = await loadImage(rawDataUrl)
      setActiveAngle(angle)
      await beginBackgroundReview({
        angle,
        colorKey: garment.fabric === 'solid' ? 'solid' : colorKey,
        rawDataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that template photo.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  /** Fired by AnglePhotoManager after it removed an angle's saved photo directly — just needs every card (and the big canvas below, if it was showing that angle) to re-check templatePhotoStore. */
  function handlePhotoRemoved(angle) {
    setActiveAngle(angle)
    setPhotoVersion((v) => v + 1)
  }

  /** Re-open the backdrop picker for the CURRENT angle/colorway's already-saved photo. Reuses the cached cutout when there is one (so the ML model never re-runs just to change backdrops); when there isn't — a photo saved via "Use original background anyway", or an older photo from before background tools existed here — this runs removeBackground() on it for the first time instead of refusing, since "upload it again" was extra, avoidable friction for something we can just do from the raw photo already on file. */
  function handleChangeBackground() {
    const photoColorKey = garment.fabric === 'solid' ? 'solid' : colorKey
    const record = getTemplatePhoto(TEMPLATE_ID, activeAngle, photoColorKey)
    if (!record) return
    beginBackgroundReview({
      angle: activeAngle,
      colorKey: photoColorKey,
      rawDataUrl: record.rawDataUrl || record.dataUrl,
      width: record.width,
      height: record.height,
      cachedCutoutDataUrl: record.cutoutDataUrl,
      initialBackdropKind: record.backdropKind || 'preset',
      initialBackdropId: record.backdropId || STUDIO_BACKDROPS[0].id,
      initialCustomBackgroundDataUrl: record.customBackgroundDataUrl || null,
      initialBgTransform: record.bgTransform || DEFAULT_BG_TRANSFORM,
      initialSubjectTransform: record.subjectTransform || DEFAULT_SUBJECT_TRANSFORM,
      initialGradientColors: record.gradientColors || null,
      initialHanger: record.hanger || DEFAULT_HANGER,
    })
  }

  /** Re-renders the review preview from whatever's currently in bgReview (backdrop choice, custom background, and both transforms) — instant, since it's plain canvas work on the already-cut-out image. */
  function recomputeBgPreview(next) {
    const canvas =
      next.backdropKind === 'custom' && next.customBackgroundImage
        ? compositeOnCustomBackground(next.cutoutImage, next.customBackgroundImage, next.bgTransform, next.subjectTransform, next.hanger)
        : compositeOnBackdrop(next.cutoutImage, next.backdropId, next.subjectTransform, next.backdropId === 'gradient' ? next.gradientColors : null, next.hanger)
    return { ...next, previewUrl: canvas.toDataURL('image/png') }
  }

  /** Requirement #7: toggle the hanger peeking above the collar, or switch its finish (natural wood / minimal neutral). */
  function handleHangerChange(patch) {
    setBgReview((prev) => (prev ? recomputeBgPreview({ ...prev, hanger: { ...prev.hanger, ...patch } }) : prev))
  }

  /** Switch to one of the built-in studio backdrops. */
  function handleBgBackdropPick(backdropId) {
    setBgReview((prev) => (prev ? recomputeBgPreview({ ...prev, backdropKind: 'preset', backdropId }) : prev))
  }

  /** Custom gradient's own two color pickers — only meaningful while backdropId === 'gradient'. */
  function handleBgGradientColorChange(patch) {
    setBgReview((prev) => (prev ? recomputeBgPreview({ ...prev, gradientColors: { ...prev.gradientColors, ...patch } }) : prev))
  }

  /** The admin's own uploaded background photo — "real model/T-shirt + my uploaded background = final mockup". */
  async function handleBgCustomBackgroundUpload(file) {
    if (!file) return
    setError(null)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('Could not read that image.'))
        reader.readAsDataURL(file)
      })
      const image = await loadImage(dataUrl)
      setBgReview((prev) =>
        prev
          ? recomputeBgPreview({
              ...prev,
              backdropKind: 'custom',
              customBackgroundDataUrl: dataUrl,
              customBackgroundImage: image,
              bgTransform: DEFAULT_BG_TRANSFORM,
            })
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that background photo.')
    }
  }

  /** Composition editor: background pan/zoom (only meaningful for a custom uploaded background). */
  function handleBgTransformChange(patch) {
    setBgReview((prev) => (prev ? recomputeBgPreview({ ...prev, bgTransform: { ...prev.bgTransform, ...patch } }) : prev))
  }

  /** Composition editor: subject (garment/model) scale + position, on top of either kind of background. */
  function handleSubjectTransformChange(patch) {
    setBgReview((prev) => (prev ? recomputeBgPreview({ ...prev, subjectTransform: { ...prev.subjectTransform, ...patch } }) : prev))
  }

  function handleBgResetComposition() {
    setBgReview((prev) =>
      prev ? recomputeBgPreview({ ...prev, bgTransform: DEFAULT_BG_TRANSFORM, subjectTransform: DEFAULT_SUBJECT_TRANSFORM, hanger: DEFAULT_HANGER }) : prev,
    )
  }

  function handleBgConfirm() {
    if (!bgReview) return
    commitBackgroundReview(bgReview)
    setBgReview(null)
  }

  function handleBgKeepOriginal() {
    if (!bgReview) return
    setTemplatePhoto(TEMPLATE_ID, bgReview.angle, bgReview.colorKey, {
      dataUrl: bgReview.rawDataUrl,
      width: bgReview.width,
      height: bgReview.height,
      rawDataUrl: bgReview.rawDataUrl,
      cutoutDataUrl: bgReview.cutoutDataUrl,
    })
    setPhotoVersion((v) => v + 1)
    setBgReview(null)
  }

  function handleBgCancel() {
    setBgReview(null)
  }

  async function handleGenerate() {
    if (bgReview) {
      commitBackgroundReview(bgReview)
      setBgReview(null)
    }
    if (!placements.length) {
      setError('Add at least one print before generating mockups.')
      return
    }
    setError(null)
    setNote(null)
    setGenerating(true)
    try {
      const { files, skipped } = await generateMockupFiles({
        templateId: TEMPLATE_ID,
        garment,
        placements,
        artworksById,
        fileStem: fileStem || 'lagamless',
      })
      const urls = {}
      for (const [slot, file] of Object.entries(files)) urls[slot] = URL.createObjectURL(file)
      setPreviewUrls(urls)
      onGenerate(files, {
        garment,
        // `layer` is the placement's explicit stacking position among the
        // OTHER prints on the same angle (0 = bottommost) — array order
        // already determines render order (see renderMockup/reorderPlacement),
        // this just makes that order an explicit, named field in the saved
        // config per the "save exact configuration" requirement.
        placements: placements.map((p) => ({
          ...p,
          artworkName: artworksById[p.artworkId]?.name || p.artworkName,
          layer: placements.filter((q) => q.angle === p.angle).findIndex((q) => q.id === p.id),
        })),
      })
      setRestoredNotice(null)
      // A partial generate (e.g. only "front" has a template photo on
      // file so far) still fills in whatever slots it could — this is a
      // heads-up, not a failure, since files/onGenerate above already
      // succeeded for every angle that DOES have a photo. Routed through
      // the info banner (not `error`) so a partial success doesn't read
      // as the button failing.
      setNote(
        skipped.length
          ? `Generated mockups for every angle with a template photo on file. Still need a real photo for: ${skipped.join(', ')} — upload those in the tabs above, then Generate again to fill in the rest.`
          : null,
      )
    } catch (err) {
      setNote(null)
      setError(err instanceof Error ? err.message : 'Could not generate mockups.')
    } finally {
      setGenerating(false)
      // Scrolling the result into view now happens for every error/note in
      // the component (see the feedbackRef effect near the top), not just
      // this one handler.
    }
  }

  const photoColorKey = garment.fabric === 'solid' ? 'solid' : colorKey
  const currentPhotoRecord = getTemplatePhoto(TEMPLATE_ID, activeAngle, photoColorKey)
  const angleView = ANGLES.find((v) => v.id === activeAngle) || ANGLES[0]
  const visiblePlacements = placements.filter((p) => p.angle === activeAngle)
  const selectedPlacement = placements.find((p) => p.id === selectedId) || null
  const selectedZones = selectedPlacement ? getPrintZones(selectedPlacement.angle) : []
  const activeFabric = FABRIC_TYPES.find((f) => f.id === garment.fabric) || FABRIC_TYPES[0]
  // Same-angle stacking group for the selected print, so the toolbar can
  // show/enable "bring forward"/"send backward" correctly.
  const layerGroup = selectedPlacement ? placements.filter((p) => p.angle === selectedPlacement.angle) : []
  const layerIndex = selectedPlacement ? layerGroup.findIndex((p) => p.id === selectedPlacement.id) : -1

  return (
    <div className="mockup-studio">
      <p className="text-small">
        The garment is always a real, uploaded photograph — never a drawn or AI-generated stand-in.
        Upload the actual product photo once per angle (and, for a special finish like acid-wash or
        tie-dye, once per colorway too); prints are perspective-warped onto it and shaded from its own
        fabric lighting so they read as printed, not pasted on.
      </p>

      {restoredNotice && <div className="admin-form__summary admin-form__summary--info">{restoredNotice}</div>}
      <div ref={feedbackRef}>
        {note && <div className="admin-form__summary admin-form__summary--info">{note}</div>}
        {error && <div className="admin-form__summary">{error}</div>}
      </div>

      <div className="mockup-studio__layout">
        <ArtworkPanel
          artworks={artworks}
          analyzing={analyzing}
          onUpload={handleUpload}
          onPlace={handlePlace}
          onRemove={handleRemoveArtwork}
          angleHasPhoto={(angle) => Boolean(getTemplatePhoto(TEMPLATE_ID, angle, photoColorKey))}
          pendingReviewAngle={bgReview ? bgReview.angle : null}
        />

        <div className="mockup-studio__stage">
          <div className="mockup-studio__garment-controls">
            <div className="mockup-studio__fabric">
              <span className="text-label">Fabric</span>
              <div className="mockup-studio__swatch-row">
                {FABRIC_TYPES.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    className={`mockup-chip${garment.fabric === f.id ? ' mockup-chip--active' : ''}`}
                    onClick={() => setGarment((g) => ({ ...g, fabric: f.id }))}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {activeFabric.usesHex ? (
              <div className="mockup-studio__swatches">
                <span className="text-label">Garment color</span>
                <div className="mockup-studio__swatch-row">
                  {(colors?.length ? colors : []).map((c) => (
                    <button
                      type="button"
                      key={c.name}
                      className={`mockup-swatch-btn${garment.hex === c.hex ? ' mockup-swatch-btn--active' : ''}`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                      aria-label={`Use ${c.name}`}
                      onClick={() => setGarment((g) => ({ ...g, hex: c.hex, colorName: c.name }))}
                    />
                  ))}
                  <input
                    type="color"
                    className="admin-color-row__swatch"
                    value={garment.hex}
                    onChange={(e) => setGarment((g) => ({ ...g, hex: e.target.value }))}
                    aria-label="Custom garment color"
                  />
                </div>
              </div>
            ) : (
              <div className="mockup-studio__swatches">
                <span className="text-label">Colorway (needs its own real photo)</span>
                <div className="mockup-studio__swatch-row">
                  {(colors?.length ? colors : [{ name: garment.colorName || 'Default' }]).map((c) => (
                    <button
                      type="button"
                      key={c.name}
                      className={`mockup-chip${garment.colorName === c.name ? ' mockup-chip--active' : ''}`}
                      onClick={() => setGarment((g) => ({ ...g, colorName: c.name }))}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <span className="text-small mockup-studio__garment-type">Garment: Oversized Tee</span>
          </div>

          <div className="mockup-angle-manager">
            <p className="text-label">Angle photos — {photoColorKey === 'solid' ? 'current colorway' : photoColorKey}</p>
            <p className="text-small">
              Each angle below uses its own real, separately-uploaded photograph — nothing here is
              generated from another angle's photo. Click a card to edit that angle in the canvas below;
              use Replace/Remove to manage that angle's photo directly.
            </p>
            <AnglePhotoManager
              templateId={TEMPLATE_ID}
              garment={garment}
              placements={placements}
              artworksById={artworksById}
              activeAngle={activeAngle}
              onSelectAngle={setActiveAngle}
              onUpload={handleTemplatePhotoUpload}
              onRemoved={handlePhotoRemoved}
              photoVersion={photoVersion}
            />
          </div>

          <div className="mockup-studio__tabs" role="tablist">
            {ANGLES.map((v) => (
              <button
                type="button"
                key={v.id}
                role="tab"
                aria-selected={activeAngle === v.id}
                className={`mockup-tab${activeAngle === v.id ? ' mockup-tab--active' : ''}`}
                onClick={() => setActiveAngle(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>

          <MockupCanvas
            key={`${activeAngle}-${colorKey}-${photoVersion}`}
            templateId={TEMPLATE_ID}
            angle={activeAngle}
            garment={garment}
            placements={visiblePlacements}
            artworksById={artworksById}
            interactive
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={handleChange}
            onDelete={handleDelete}
            onUploadTemplatePhoto={handleTemplatePhotoUpload}
            onDragStart={pushHistory}
          />
          {uploadingPhoto && !bgWorking && <p className="text-small">Reading template photo…</p>}

          {bgFailure && (
            <div className="mockup-bg-review mockup-bg-review--failure">
              <p className="text-label">Background Studio couldn't finish</p>
              <p className="text-small">
                {bgFailure.message} The photo itself uploaded fine and hasn't been saved with any background
                yet — choose what to do next:
              </p>
              <div className="mockup-bg-review__actions">
                <button type="button" className="btn btn-primary" onClick={handleBgRetry}>
                  Try again
                </button>
                <button type="button" className="btn-ghost" onClick={handleBgFailureUseOriginal}>
                  Use original background anyway
                </button>
              </div>
            </div>
          )}

          {bgWorking && (
            <div className="mockup-bg-review mockup-bg-review--working">
              <p className="text-small">
                Preparing Background Studio (in-browser, one-time model load)… {Math.round(bgProgress * 100)}%
              </p>
              <div className="mockup-bg-progress">
                <div className="mockup-bg-progress__bar" style={{ width: `${Math.round(bgProgress * 100)}%` }} />
              </div>
            </div>
          )}

          {bgReview && (
            <div className="mockup-bg-review">
              <p className="text-label">Background &amp; composition</p>
              <p className="admin-form__summary admin-form__summary--info mockup-bg-review__callout">
                Previewing this background. Click <strong>"Use this background"</strong> to lock it in now, or just go
                ahead and click "Add to garment" / "Generate mockups" below — either one saves this exact preview
                automatically before it does its own job.
              </p>
              <div className="mockup-bg-review__body">
                <div className="mockup-bg-review__preview-wrap">
                  <div className="mockup-bg-review__before-after" role="group" aria-label="Before / after background change">
                    <button
                      type="button"
                      className={`btn-ghost${!bgShowBefore ? ' mockup-bg-toggle--active' : ''}`}
                      aria-pressed={!bgShowBefore}
                      onClick={() => setBgShowBefore(false)}
                    >
                      After
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost${bgShowBefore ? ' mockup-bg-toggle--active' : ''}`}
                      aria-pressed={bgShowBefore}
                      onClick={() => setBgShowBefore(true)}
                    >
                      Before
                    </button>
                  </div>
                  <img
                    src={bgShowBefore ? bgReview.rawDataUrl : bgReview.previewUrl}
                    alt={bgShowBefore ? 'Original upload, before Background Studio' : 'Subject on the chosen Background Studio backdrop'}
                    className="mockup-bg-review__preview"
                  />
                  <p className="text-small">
                    {bgShowBefore
                      ? 'Original upload, as photographed.'
                      : 'Transparent-subject cutout composited on the backdrop below.'}
                  </p>
                </div>
                <div className="mockup-bg-review__controls">
                  <div className="mockup-bg-review__swatches">
                    {STUDIO_BACKDROPS.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        className={`mockup-bg-swatch${bgReview.backdropKind === 'preset' && bgReview.backdropId === b.id ? ' mockup-bg-swatch--active' : ''}`}
                        style={{
                          background: `linear-gradient(${b.id === 'gradient' ? bgReview.gradientColors.top : b.top}, ${b.id === 'gradient' ? bgReview.gradientColors.bottom : b.bottom})`,
                        }}
                        title={b.label}
                        aria-label={b.label}
                        onClick={() => handleBgBackdropPick(b.id)}
                      />
                    ))}
                    <label
                      className={`mockup-bg-swatch mockup-bg-swatch--custom${bgReview.backdropKind === 'custom' ? ' mockup-bg-swatch--active' : ''}`}
                      title="Upload custom background"
                    >
                      +
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) handleBgCustomBackgroundUpload(file)
                        }}
                      />
                    </label>
                  </div>
                  <span className="text-small">
                    {bgReview.backdropKind === 'custom'
                      ? 'Custom uploaded background'
                      : STUDIO_BACKDROPS.find((b) => b.id === bgReview.backdropId)?.label}
                  </span>

                  {bgReview.backdropKind === 'preset' && bgReview.backdropId === 'gradient' && (
                    <div className="mockup-bg-review__sliders">
                      <span className="text-label">Gradient colors</span>
                      <label className="text-small">
                        Top
                        <input
                          type="color"
                          value={bgReview.gradientColors.top}
                          onChange={(e) => handleBgGradientColorChange({ top: e.target.value })}
                        />
                      </label>
                      <label className="text-small">
                        Bottom
                        <input
                          type="color"
                          value={bgReview.gradientColors.bottom}
                          onChange={(e) => handleBgGradientColorChange({ bottom: e.target.value })}
                        />
                      </label>
                    </div>
                  )}

                  {bgReview.backdropKind === 'custom' && (
                    <div className="mockup-bg-review__sliders">
                      <span className="text-label">Background</span>
                      <label className="text-small">
                        Scale
                        <input
                          type="range"
                          min="0.6"
                          max="2.5"
                          step="0.02"
                          value={bgReview.bgTransform.scale}
                          onChange={(e) => handleBgTransformChange({ scale: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-small">
                        Position X
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.01"
                          value={bgReview.bgTransform.offsetX}
                          onChange={(e) => handleBgTransformChange({ offsetX: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-small">
                        Position Y
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.01"
                          value={bgReview.bgTransform.offsetY}
                          onChange={(e) => handleBgTransformChange({ offsetY: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                  )}

                  <div className="mockup-bg-review__sliders">
                    <span className="text-label">Model / garment</span>
                    <label className="text-small">
                      Scale
                      <input
                        type="range"
                        min="0.5"
                        max="1.6"
                        step="0.02"
                        value={bgReview.subjectTransform.scale}
                        onChange={(e) => handleSubjectTransformChange({ scale: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-small">
                      Position X
                      <input
                        type="range"
                        min="-0.4"
                        max="0.4"
                        step="0.01"
                        value={bgReview.subjectTransform.offsetX}
                        onChange={(e) => handleSubjectTransformChange({ offsetX: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-small">
                      Position Y
                      <input
                        type="range"
                        min="-0.4"
                        max="0.4"
                        step="0.01"
                        value={bgReview.subjectTransform.offsetY}
                        onChange={(e) => handleSubjectTransformChange({ offsetY: Number(e.target.value) })}
                      />
                    </label>
                  </div>

                  <div className="mockup-bg-review__sliders">
                    <span className="text-label">Hanger</span>
                    <label className="text-small mockup-bg-review__checkbox">
                      <input
                        type="checkbox"
                        checked={bgReview.hanger.show}
                        onChange={(e) => handleHangerChange({ show: e.target.checked })}
                      />
                      Show hanger above collar
                    </label>
                    {bgReview.hanger.show && (
                      <select
                        className="input"
                        value={bgReview.hanger.style}
                        onChange={(e) => handleHangerChange({ style: e.target.value })}
                        aria-label="Hanger finish"
                      >
                        {Object.entries(HANGER_STYLES).map(([id, s]) => (
                          <option key={id} value={id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="text-small mockup-bg-review__hint">
                      Turn this off for a side, detail, or close-up crop where a hanger doesn't belong.
                    </span>
                  </div>

                  <div className="mockup-bg-review__actions">
                    <button type="button" className="btn btn-primary" onClick={handleBgConfirm}>
                      Use this background
                    </button>
                    <button type="button" className="btn-ghost" onClick={handleBgResetComposition}>
                      Reset composition
                    </button>
                    <button type="button" className="btn-ghost" onClick={handleBgKeepOriginal}>
                      Keep original background instead
                    </button>
                    <button type="button" className="btn-ghost" onClick={handleBgCancel}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!bgWorking && !bgReview && currentPhotoRecord && (
            <button type="button" className="btn-ghost mockup-studio__bg-change" onClick={handleChangeBackground}>
              Background Studio
            </button>
          )}

          {selectedPlacement && (
            <div className="mockup-studio__placement-toolbar">
              <label className="text-small">
                Position
                <select
                  className="input"
                  value={selectedPlacement.zoneId || ''}
                  onChange={(e) => handleRezone(selectedPlacement.id, e.target.value)}
                >
                  {selectedZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-small">
                Opacity
                <input
                  type="range"
                  min="0.4"
                  max="1"
                  step="0.02"
                  value={selectedPlacement.opacity}
                  onPointerDown={pushHistory}
                  onChange={(e) => handleChange(selectedPlacement.id, { ...selectedPlacement, opacity: Number(e.target.value) })}
                />
              </label>

              <div className="mockup-studio__placement-actions">
                <button type="button" className="btn-ghost" onClick={() => handleDuplicate(selectedPlacement.id)}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => handleReorder(selectedPlacement.id, 'up')}
                  disabled={layerIndex < 0 || layerIndex >= layerGroup.length - 1}
                >
                  Bring forward
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => handleReorder(selectedPlacement.id, 'down')}
                  disabled={layerIndex <= 0}
                >
                  Send backward
                </button>
                {layerGroup.length > 1 && (
                  <span className="text-small">
                    Layer {layerIndex + 1} of {layerGroup.length}
                  </span>
                )}
              </div>

              <div className="mockup-studio__placement-actions">
                <button type="button" className="btn-ghost" onClick={() => handleResetPosition(selectedPlacement.id)}>
                  Reset position
                </button>
                <button type="button" className="btn-ghost" onClick={() => handleResetSize(selectedPlacement.id)}>
                  Reset size
                </button>
                <button type="button" className="btn-ghost" onClick={() => handleResetRotation(selectedPlacement.id)}>
                  Reset rotation (0°)
                </button>
                <button type="button" className="btn-ghost" onClick={() => handleResetArtwork(selectedPlacement.id)}>
                  Reset artwork
                </button>
              </div>

              <span className="text-small">
                Drag a corner dot to adjust perspective · Rotation: {Math.round(((selectedPlacement.rotation % 360) + 360) % 360)}°
              </span>
            </div>
          )}

          <div className="mockup-studio__actions">
            <button type="button" className="btn btn-secondary" onClick={handleUndo} disabled={!past.length}>
              Undo
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleRedo} disabled={!future.length}>
              Redo
            </button>
            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate mockups'}
            </button>
            <span className="text-small">{angleView.label} view · {visiblePlacements.length} print(s) shown</span>
          </div>

          {previewUrls && (
            <div className="mockup-gallery">
              <p className="text-label">Mockup gallery</p>
              <div className="mockup-gallery__grid">
                {Object.entries(previewUrls)
                  .filter(([slot]) => slot !== 'main')
                  .map(([slot, url]) => (
                    <figure key={slot} className="mockup-gallery__item">
                      <img src={url} alt={`Generated ${GALLERY_LABELS[slot] || slot} mockup`} />
                      <figcaption>{GALLERY_LABELS[slot] || slot}</figcaption>
                    </figure>
                  ))}
              </div>
              <p className="text-small">
                Sent to the matching product image slots below. Review them there; re-generate any time
                before publishing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MockupStudio
