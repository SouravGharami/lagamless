import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import sharePreview from './share/viteSharePlugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sharePreview()],
})
