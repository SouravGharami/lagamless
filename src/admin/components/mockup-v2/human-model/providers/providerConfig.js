/**
 * Provider configuration — reads ONLY non-secret, VITE_-prefixed settings. No token can be configured here:
 * if a Hugging Face Space needs authentication, requests go through the `vton-gradio-proxy` Edge Function, which
 * keeps the token in a Supabase secret (see docs/free-vton-architecture.md).
 *
 *   VITE_HF_VTON_SPACE_URL        https://<owner>-<space>.hf.space  (public Space, direct mode)
 *   VITE_HF_VTON_MODE             'direct' (default) | 'proxy'  — proxy = use the Edge Function (private / token-protected Space)
 *   VITE_HF_VTON_API_NAME         optional, e.g. /tryon  — auto-detected when the Space has one suitable endpoint
 *   VITE_HF_VTON_PARAM_MAP        optional JSON, e.g. {"person":"model_image","garment":"garment_image","category":"category"}
 *   VITE_HF_VTON_EXTRA_PARAMS     optional JSON of fixed extra parameters by name, e.g. {"num_timesteps":30}
 *   VITE_HF_VTON_TIMEOUT_SECONDS  optional, default 300
 *   VITE_KAGGLE_WEEKLY_GPU_HOURS  optional, default 30 — a CONFIGURED allowance, not a quota reading
 *   VITE_PIXELCUT_VTON_ENABLED    'true' to explicitly enable the paid Pixelcut provider
 *   VITE_PIXELCUT_VTON_TIMEOUT_SECONDS optional, default 300
 */

/** Licensing notice shown in the configuration panel and docs (Part C). Do not weaken this text. */
export const LICENSING_NOTICE =
  'Licensing review required: the selected VTON model/Space and every helper model it loads (pose, parsing, segmentation, ' +
  'background-removal, upscaling) must be reviewed for COMMERCIAL use before production use. Nothing here is certified as ' +
  'commercially cleared, and models with non-commercial licenses must not be added.'

const env = (name) => {
  try {
    const v = import.meta.env?.[name]
    return typeof v === 'string' ? v.trim() : ''
  } catch {
    return ''
  }
}

function parseJsonObject(text, name) {
  if (!text) return {}
  try {
    const v = JSON.parse(text)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v
  } catch { /* fall through */ }
  console.error(`[vton] ${name} is not a valid JSON object and was ignored.`)
  return {}
}

/** Secrets must never be in VITE_ variables. Returns the names of any suspicious ones so the UI/logs can flag them. */
export function findSecretLikeViteVars(source = import.meta.env ?? {}) {
  return Object.keys(source).filter((k) => /^VITE_.*(HF_TOKEN|HUGGING.?FACE.*(TOKEN|KEY)|SERVICE_ROLE|SECRET|API_KEY_PRIVATE)/i.test(k) || (/^VITE_.*TOKEN/i.test(k) && String(source[k]).startsWith('hf_')))
}

export function readVtonConfig(source) {
  const read = source ? (n) => (typeof source[n] === 'string' ? source[n].trim() : '') : env
  const spaceUrl = read('VITE_HF_VTON_SPACE_URL').replace(/\/+$/, '')
  const mode = read('VITE_HF_VTON_MODE') === 'proxy' ? 'proxy' : 'direct'
  const hours = Number(read('VITE_KAGGLE_WEEKLY_GPU_HOURS'))
  const timeout = Number(read('VITE_HF_VTON_TIMEOUT_SECONDS'))
  const pixelcutTimeout = Number(read('VITE_PIXELCUT_VTON_TIMEOUT_SECONDS'))
  return {
    hf: {
      spaceUrl,
      mode,
      apiName: read('VITE_HF_VTON_API_NAME') || '/try_on',
      paramMap: parseJsonObject(read('VITE_HF_VTON_PARAM_MAP'), 'VITE_HF_VTON_PARAM_MAP'),
      extraParams: parseJsonObject(read('VITE_HF_VTON_EXTRA_PARAMS'), 'VITE_HF_VTON_EXTRA_PARAMS'),
      providerLabel: read('VITE_HF_VTON_PROVIDER_LABEL') || 'FASHN VTON 1.5 — Free Hugging Face ZeroGPU',
      timeoutMs: (Number.isFinite(timeout) && timeout > 0 ? timeout : 300) * 1000,
    },
    kaggle: { weeklyAllowanceHours: Number.isFinite(hours) && hours > 0 ? hours : 30 },
    pixelcut: { enabled: read('VITE_PIXELCUT_VTON_ENABLED') === 'true', timeoutMs: (Number.isFinite(pixelcutTimeout) && pixelcutTimeout > 0 ? pixelcutTimeout : 300) * 1000 },
  }
}

/** Is the Hugging Face provider configured? (Space URL present and, in proxy mode, Supabase available.) */
export function hfConfigStatus(config = readVtonConfig(), { supabaseReady = true } = {}) {
  if (config.hf.mode === 'proxy') {
    return supabaseReady ? { ok: true, message: 'Configured (secure proxy)' } : { ok: false, message: 'Provider configuration is missing.' }
  }
  if (!/^https:\/\/[^/\s]+/i.test(config.hf.spaceUrl)) {
    return { ok: false, message: 'Provider configuration is missing.' }
  }
  return { ok: true, message: 'Configured (public Space)' }
}
