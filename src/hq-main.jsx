import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DojoHQ from './DojoHQ'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DojoHQ />
  </StrictMode>,
)
