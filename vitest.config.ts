import { defineConfig } from 'vitest/config'
import path from 'path'

// Standalone vitest config — deliberately does not reuse vite.config.ts
// (PWA/react plugins are irrelevant to the pure-function tests and slow
// startup). Tests target lib/ and db/ modules with no DOM or WASM deps,
// so the plain node environment suffices.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
