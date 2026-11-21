import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-etsy',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
