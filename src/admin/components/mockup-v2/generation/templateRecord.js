/** Step 5-2 — pure mapping between a MockupTemplate and a `mockup_templates` row (see supabase/part-30). No I/O. */
export function templateToRow(t, sourcePath = null) {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    source_type: 'stored_template', // a saved row is a stored template by definition
    asset_kind: t.assetKind,
    source_image: t.source.url,
    source_path: sourcePath ?? t.source.ref ?? null,
    preview_image: t.previewImage ?? t.source.url,
    angle: t.angle,
    garment_type: t.garmentType,
    supported_colors: t.colors,
    supported_regions: t.supportedRegions,
    placement: t.placement ?? {},
    image_info: t.imageInfo ?? {},
    mask_data: t.maskData ?? {},
    active: t.active !== false,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }
}

/** Row -> createTemplate() input. */
export function rowToTemplateInput(row) {
  const info = row.image_info ?? {}
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    sourceType: row.source_type,
    assetKind: row.asset_kind,
    angle: row.angle,
    garmentType: row.garment_type,
    colors: row.supported_colors,
    supportedRegions: row.supported_regions,
    source: { url: row.source_image, ref: row.source_path, width: info.width ?? null, height: info.height ?? null },
    previewImage: row.preview_image ?? row.source_image,
    placement: row.placement ?? {},
    imageInfo: info,
    maskData: row.mask_data ?? {},
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Columns changed when only the photograph is replaced. */
export function photoPatchToRow(t) {
  return { source_image: t.source.url, source_path: t.source.ref, preview_image: t.previewImage, image_info: t.imageInfo }
}
