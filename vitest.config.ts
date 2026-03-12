import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['packages/*/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@mine/core': path.resolve(__dirname, 'packages/core/src'),
      '@mine/agents': path.resolve(__dirname, 'packages/agents/src'),
      '@mine/sdk': path.resolve(__dirname, 'packages/sdk/src'),
    },
  },
});
