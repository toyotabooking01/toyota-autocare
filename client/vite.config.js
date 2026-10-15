import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const value = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL?.trim()
    let url
    try { url = new URL(value) } catch { throw new Error('Set VITE_API_URL to the HTTPS backend /api URL before building.') }
    if (url.protocol !== 'https:' || url.pathname.replace(/\/$/, '') !== '/api' || url.search || url.hash || url.username || url.password)
      throw new Error('VITE_API_URL must be an HTTPS backend URL ending in /api.')
  }
  return {
    plugins: [react()],
    server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared', import.meta.url))] } },
  }
})
