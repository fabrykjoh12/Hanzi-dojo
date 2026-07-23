import process from 'node:process'
import { execSync } from 'node:child_process'
import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build stamp so a running app can prove which commit it is. Sources, in order:
// the CI-provided commit SHA (GitHub Actions / Vercel), else the local git HEAD,
// else 'dev'. Exposed to the app via import.meta.env and written to
// /version.json at the site root for scripted checks. Best-effort — never fails
// the build.
function buildInfo() {
  const env = process.env
  let sha = env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA || ''
  if (!sha) {
    try { sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { sha = '' }
  }
  return { sha: sha ? sha.slice(0, 7) : 'dev', fullSha: sha || 'dev', builtAt: new Date().toISOString() }
}

// https://vite.dev/config/
// The app is served from the root on its canonical host (Vercel → hanzi-dojo.com)
// and in local dev, so the base is always '/'. (A former GitHub Pages deployment
// served under the /Hanzi-dojo/ repo subpath; that host has been retired.)
export default defineConfig(() => {
  const info = buildInfo()
  return {
    base: '/',
    define: {
      'import.meta.env.VITE_BUILD_SHA': JSON.stringify(info.sha),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(info.builtAt),
    },
    build: {
      outDir: 'dist/client',
      rollupOptions: {
        input: {
          main: 'index.html',
          hq: 'hq.html',
        },
        output: {
          // Split the Supabase client into its own chunk so it caches
          // independently of app code across deploys (app changes far more
          // often than the SDK), and doesn't bloat the entry chunk.
          // (Rolldown/Vite 8 requires the function form.)
          manualChunks(id) {
            if (id.includes('@supabase/supabase-js')) return 'vendor-supabase'
          },
        },
      },
    },
    plugins: [
      react(),
      {
        name: 'dojo-sites-output',
        apply: 'build',
        async closeBundle() {
          const serverDirectory = resolve('dist', 'server')
          const metadataDirectory = resolve('dist', '.openai')
          await rm(serverDirectory, { recursive: true, force: true })
          await rm(metadataDirectory, { recursive: true, force: true })
          await mkdir(serverDirectory, { recursive: true })
          await mkdir(metadataDirectory, { recursive: true })
          await copyFile(resolve('worker', 'index.js'), resolve(serverDirectory, 'index.js'))
          await copyFile(resolve('.openai', 'hosting.json'), resolve(metadataDirectory, 'hosting.json'))
          await cp(resolve('drizzle'), resolve(metadataDirectory, 'drizzle'), { recursive: true })
          await copyFile(resolve('dist', 'client', 'hq.html'), resolve('dist', 'client', 'index.html'))
          await rm(resolve('dist', 'client', 'sw.js'), { force: true })
        },
      },
      {
        // Emit /version.json into the build so the deployed commit is checkable
        // with `curl <site>/version.json` (no devtools needed).
        name: 'hd-version-json',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info, null, 2) + '\n' })
        },
      },
    ],
  }
})
