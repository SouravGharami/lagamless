import { useRef, useState } from 'react'
import { readImageFile } from './mockupStudioAssets.js'

/**
 * Hidden-file-input plumbing shared by every upload control. Each picked
 * file is read into a blob URL and handed to `onAsset`; failures become a
 * studio notice instead of throwing.
 */
export function useImagePicker({ dispatch, onAsset, accepted }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function onChange(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = '' // allow re-picking the same file
    if (!files.length) return
    setBusy(true)
    try {
      for (const file of files) {
        try {
          onAsset(await readImageFile(file, accepted))
        } catch (err) {
          dispatch({ type: 'NOTICE', message: err.message })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return { inputRef, onChange, busy, open: () => { if (!busy) inputRef.current?.click() } }
}
