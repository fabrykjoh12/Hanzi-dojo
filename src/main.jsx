import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the offline service worker in production only (keeps dev/sandbox
// clean). Scope follows BASE_URL so it works on both the GitHub Pages subpath
// and the Vercel root. Failures are non-fatal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(function () { /* ignore */ })
  })
}
