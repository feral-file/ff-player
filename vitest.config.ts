/**
 * Vitest config. `package.json` overrides `vite` to ^6 for Vitest 3 and pins
 * `jsdom` to 24.x so the jsdom environment loads under Node (v29 pulls ESM-only
 * whatwg stacks that break Vitest’s CJS loader on current Node LTS ranges).
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // Align with Next automatic JSX runtime so components under test do not need `React` in scope.
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    clearMocks: true,
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
