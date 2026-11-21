import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-file-hosts',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
