import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/tests/unit/**/*.spec.tsx', 'src/tests/integration/**/*.spec.tsx'],
  },
})
