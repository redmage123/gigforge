import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8070',
      '/contacts': 'http://127.0.0.1:8070',
      '/companies': 'http://127.0.0.1:8070',
      '/tags': 'http://127.0.0.1:8070',
      '/api': 'http://127.0.0.1:8070',
    },
  },
})
