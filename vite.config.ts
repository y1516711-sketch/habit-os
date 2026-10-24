import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite 5: binding 0.0.0.0 accepts the live-preview proxy host (no allowedHosts option needed/available).
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
})
