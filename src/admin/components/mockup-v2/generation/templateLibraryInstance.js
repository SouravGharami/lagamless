/** Step 5-2 — the one shared library instance for the studio (wiring only; all logic is in templateLibrary.js). */
import { isSupabaseConfigured } from '../../../../lib/supabase.js'
import { createSupabaseTemplateBackend } from '../../../../services/mockupTemplates.js'
import { createTemplateLibrary, createMemoryBackend } from './templateLibrary.js'

export const templateLibrary = createTemplateLibrary({
  backend: isSupabaseConfigured ? createSupabaseTemplateBackend() : createMemoryBackend(),
  // If the table/policies are not set up yet, the library still works for this session and says so.
  fallbackBackend: createMemoryBackend(),
})
