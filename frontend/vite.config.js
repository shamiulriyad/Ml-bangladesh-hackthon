import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // No server.proxy here on purpose: Vite's preview server falls back to server.proxy when
  // preview.proxy isn't set (proxy: preview?.proxy ?? server.proxy), so a dev-only proxy
  // target here would leak into `vite preview` in production and fail with ECONNREFUSED.
  // The app talks to the backend via VITE_API_URL (see frontend/.env.example) instead, both
  // in local dev and on Render, so no proxy is needed in either environment.
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['ml-bangladesh-hackthon-1.onrender.com']
  }
})
