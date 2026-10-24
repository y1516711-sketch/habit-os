import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './lib/store.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode><StoreProvider><App /></StoreProvider></StrictMode>,
)
// PWA: offline support + installability (production only, so dev stays simple)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* offline is a bonus, never block app */ }) })
}
