// Netlify function: serves /p/<slug> and /p/<slug>/og.jpg
import { handleShare } from '../../share/core.js'

export default (request) => handleShare(request, { env: process.env })

export const config = { path: ['/p/:slug', '/p/:slug/og.jpg'] }
