import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
    environment: 'node',
    // CopilotKit's v2 entry imports CSS; let Vite process it.
    server: { deps: { inline: [/@copilotkit/] } },
  },
})
