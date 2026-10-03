import { useEffect, useSyncExternalStore } from 'react'
import { templateLibrary } from '../generation/templateLibraryInstance.js'

/** Subscribes to the shared photo-template library and loads it once. */
export function useTemplateLibrary() {
  const snapshot = useSyncExternalStore(templateLibrary.subscribe, templateLibrary.getSnapshot)
  useEffect(() => {
    templateLibrary.load()
  }, [])
  return { snapshot, library: templateLibrary }
}
