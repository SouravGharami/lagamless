/** Provider-neutral generation planning helper. It never calls a provider. */
export function planGenerationJobs({ assets, provider, productId = null } = {}) {
  const specs = []
  const skipped = []
  for (const requested of assets?.requestedViews ?? []) {
    const view = requested?.type
    if (!provider?.supportedViews?.includes(view)) {
      skipped.push({ view, reason: 'This provider does not explicitly support this view.' }); continue
    }
    const angle = String(view || '').toUpperCase()
    const hasGarment = !!assets?.garment?.views?.[angle]
    if (!hasGarment) { skipped.push({ view, reason: 'The requested view has no rendered garment image.' }); continue }
    specs.push({ jobId: `${productId || 'product'}-${view}`, productId, view, providerId: provider.id, angle: requested?.angle ?? null })
  }
  return { specs, skipped }
}
