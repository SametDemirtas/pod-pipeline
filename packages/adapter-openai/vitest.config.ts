import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-openai',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
