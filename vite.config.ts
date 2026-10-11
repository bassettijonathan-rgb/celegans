import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under GitHub Pages' /celegans/ path.
  base: './',
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    // Physics and gait tests run seconds of worm time; CI runners are slower than a laptop.
    testTimeout: 30_000,
  },
});
