import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-anthropic',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
