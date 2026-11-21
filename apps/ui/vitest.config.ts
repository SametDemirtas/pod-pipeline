import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'ui',
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['src/testing/setup.ts'],
    css: false,
    // Rendering the whole app is slow on a busy machine.
    testTimeout: 15_000,
  },
});
