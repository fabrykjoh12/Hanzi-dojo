import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DojoHQ from './DojoHQ'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
    .catch(() => {})
}

if ('caches' in globalThis) {
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('hanzi-')).map(key => caches.delete(key))))
    .catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DojoHQ />
  </StrictMode>,
)
