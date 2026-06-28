import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// On GitHub Pages the site is served from /Hanzi-dojo/ (the repo name), so the
// production build must use that base or every asset URL 404s. Local dev stays
// at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Hanzi-dojo/' : '/',
  plugins: [react()],
}))
