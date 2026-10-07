// Vercel function: /p/<slug>/og.jpg  ->  1200x630 branded preview image
import { handleShare } from '../share/core.js'

export function GET(request) {
  return handleShare(request, { env: process.env, mode: 'image' })
}
