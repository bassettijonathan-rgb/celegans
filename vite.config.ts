import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under GitHub Pages' /celegans/ path.
  base: './',
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
