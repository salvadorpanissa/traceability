import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// @testing-library/react only auto-registers its afterEach cleanup when it
// detects a global `afterEach` (see node_modules/@testing-library/react/dist/index.js).
// Our vitest.config.mts does not set `test.globals: true`, so that detection
// never fires and DOM from one test leaks into the next. Register it explicitly.
afterEach(() => {
  cleanup()
})
