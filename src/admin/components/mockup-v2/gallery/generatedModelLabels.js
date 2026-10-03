import { getProvider } from '../human-model/providers/providerRegistry.js'
import { MODEL_VIEW_DEFS } from '../human-model/humanModelState.js'

/** Display helpers shared by the Human Model Studio result preview and the generated gallery. */
export const generatedViewLabel = (view) => MODEL_VIEW_DEFS.find((v) => v.id === view)?.label ?? String(view)

/** The real provider name for a stored provider id (never claims a provider that did not produce the image). */
export const generatedProviderLabel = (id) => getProvider(id)?.label ?? id ?? 'Unknown provider'

export const generatedStatusLabel = (item) => (item.status === 'approved' ? 'Approved' : item.status === 'rejected' ? 'Rejected' : 'Pending approval')
