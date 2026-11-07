import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Frozen reference for every test that does not set its own: 5 Nov 2026, 10:00 IST.
      env: { TZ: 'Asia/Kolkata' },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['tests/unit/**/*.test.ts'],
            environment: 'node',
            setupFiles: ['tests/setup/unit.ts'],
          },
        },
        {
          extends: true,
          test: {
            // One Repository suite, run against every implementation (tests/contract/repositoryContract.ts).
            name: 'contract',
            include: ['tests/contract/**/*.test.ts'],
            environment: 'node',
            setupFiles: ['tests/setup/unit.ts'],
          },
        },
        {
          extends: true,
          test: {
            // The calendar server (api/) against the fake Google and the in-memory store.
            name: 'server',
            include: ['tests/server/**/*.test.ts'],
            environment: 'node',
          },
        },
        {
          extends: true,
          test: {
            name: 'component',
            include: ['tests/component/**/*.test.tsx'],
            environment: 'jsdom',
            setupFiles: ['tests/setup/component.ts'],
          },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
        exclude: [
          'src/main.tsx',
          'src/**/*.d.ts',
          'src/styles/tokens.css',
          // The /design showcase is a visual catalogue covered by Playwright visual and a11y tests.
          'src/features/design/**',
        ],
        reporter: ['text-summary', 'html', 'json-summary'],
        thresholds: {
          lines: 70,
          'src/domain/**': { lines: 90 },
        },
      },
    },
  }),
)
