import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Without these two env vars, createClient() throws "supabaseUrl is required"
// at import time — which crashes the app before React mounts and leaves the
// page completely blank. Show a clear, actionable message instead of nothing.
if (!supabaseUrl || !supabaseAnonKey) {
  const message =
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and ' +
    'VITE_SUPABASE_ANON_KEY (in a local .env file, or in your hosting ' +
    'provider’s environment variables) and rebuild/redeploy.'

  if (typeof document !== 'undefined') {
    const root = document.getElementById('root')
    if (root) {
      root.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                    font-family:system-ui,-apple-system,sans-serif;background:#faf7f2;padding:24px;">
          <div style="max-width:480px;background:#fff;border:1px solid #eadfce;border-radius:12px;
                      padding:28px 32px;box-shadow:0 4px 24px rgba(0,0,0,.06);">
            <h1 style="margin:0 0 8px;font-size:18px;color:#b23a2e;">Site can’t start</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444;">${message}</p>
            <pre style="margin:0;background:#f5f1ea;border-radius:8px;padding:12px;font-size:12px;
                        color:#555;white-space:pre-wrap;">VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...</pre>
          </div>
        </div>`
    }
  }

  throw new Error(message)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
