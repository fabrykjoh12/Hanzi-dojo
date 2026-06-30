import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// react-router basename must match the host's base path (Pages serves under
// /Hanzi-dojo/, Vercel/dev under /). Strip the trailing slash for a subpath.
const rawBase = import.meta.env.BASE_URL
const basename = rawBase.length > 1 && rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
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
