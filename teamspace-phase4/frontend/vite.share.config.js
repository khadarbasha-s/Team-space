// Used only for sharing the app through a single public tunnel: serves the
// frontend and forwards /backend/* (HTTP + WebSocket) to the API on :8000.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: '127.0.0.1',
    allowedHosts: true,
    proxy: {
      '/backend': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/backend/, ''),
      },
    },
  },
})
