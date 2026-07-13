import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
// Base path differs per host:
//   - GitHub Pages serves under /Hanzi-dojo/ (the repo name).
//   - Vercel (and local dev) serve from the root /.
// Vercel sets the VERCEL env var during its build, so only GitHub Pages
// production builds get the subpath; everything else uses /.
export default defineConfig(({ command }) => {
  const isGitHubPages = command === 'build' && !process.env.VERCEL
  return {
    base: isGitHubPages ? '/Hanzi-dojo/' : '/',
    plugins: [react(), cloudflare()],
  };
})