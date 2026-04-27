import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/components/**', 'src/hooks/**', 'src/api/mock/**'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
})
