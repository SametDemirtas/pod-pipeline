import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-realesrgan',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
