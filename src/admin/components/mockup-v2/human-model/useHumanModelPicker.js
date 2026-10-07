import { useRef, useState } from 'react'
import { readHumanModelFile } from './humanModelValidation.js'

/**
 * Hidden file input + drag/drop plumbing for the model photo. The file is validated and decoded
 * locally; nothing is uploaded anywhere. Rejections are kept as structured errors for the UI.
 */
export function useHumanModelPicker({ onAsset }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState([])
  const [warnings, setWarnings] = useState([])

  async function handleFile(file) {
    setBusy(true)
    try {
      const outcome = await readHumanModelFile(file)
      setErrors(outcome.errors)
      setWarnings(outcome.warnings)
      if (outcome.ok) onAsset(outcome.asset)
    } finally {
      setBusy(false)
    }
  }

  return {
    inputRef,
    busy,
    errors,
    warnings,
    open: () => { if (!busy) inputRef.current?.click() },
    onChange: (event) => {
      const file = event.target.files?.[0]
      event.target.value = '' // allow re-picking the same file
      if (file) handleFile(file)
    },
    onDropFile: (file) => { if (!busy && file) handleFile(file) },
    clearMessages: () => { setErrors([]); setWarnings([]) },
  }
}
