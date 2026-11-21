import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-sqlite',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
