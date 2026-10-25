import { defineConfig } from 'vitest/config';

// Unit tests cover the pure core (src/core) and run without the IWSDK dev plugin.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
