import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-ai',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
