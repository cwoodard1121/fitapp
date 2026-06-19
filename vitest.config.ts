import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The engine is pure — no DOM needed.
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
