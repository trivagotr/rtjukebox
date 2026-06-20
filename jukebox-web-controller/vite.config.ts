import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig((env) => {
  const isPreview = 'isPreview' in env ? Boolean(env.isPreview) : process.env.npm_lifecycle_event === 'preview'

  return {
    plugins: [react()],
    // The dev server is served from root; production/preview builds are served
    // from the backend at /controller (overridable per-deployment).
    base: env.command === 'serve' && !isPreview ? '/' : (process.env.VITE_APP_BASE_PATH || '/controller/'),
  }
})
