import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Vitest's default include pattern (**/*.spec.ts) also matches the
    // Playwright specs in e2e/, which use Playwright's own `test()` global
    // and are not valid Vitest tests — exclude that directory explicitly.
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
