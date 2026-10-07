/** Web Worker host for core.js — keeps detection and recoloring off the main thread. */
import { prepareGarment, renderRecolor } from './core.js'

const MAX_PREPS = 6
const preps = new Map() // key -> prep (insertion-ordered LRU)

self.onmessage = (event) => {
  const msg = event.data
  try {
    if (msg.type === 'prepare') {
      const photo = { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) }
      const mask = msg.maskBuffer ? new Uint8Array(msg.maskBuffer) : null
      const prep = prepareGarment(photo, { fabricHint: msg.fabricHint ?? null, fillsFrame: msg.fillsFrame === true, mask })
      if (prep.ok) {
        preps.delete(msg.key)
        preps.set(msg.key, prep)
        while (preps.size > MAX_PREPS) preps.delete(preps.keys().next().value)
      }
      self.postMessage({
        id: msg.id,
        ok: true,
        info: prep.ok
          ? { ok: true, width: prep.width, height: prep.height, hasAlpha: prep.hasAlpha, level: prep.level, confidence: prep.confidence }
          : { ok: false, reason: prep.reason },
      })
    } else if (msg.type === 'render') {
      const prep = preps.get(msg.key)
      if (!prep) {
        self.postMessage({ id: msg.id, ok: false, error: 'evicted' })
        return
      }
      preps.delete(msg.key)
      preps.set(msg.key, prep)
      const rgba = renderRecolor(prep, msg.hex)
      self.postMessage({ id: msg.id, ok: true, width: prep.width, height: prep.height, buffer: rgba.buffer }, [rgba.buffer])
    }
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: err?.message || String(err) })
  }
}
