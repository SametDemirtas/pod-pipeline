import { defineConfig } from 'vite';

/** Bundles the server into one executable file with no runtime dependencies. */
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'index.js', banner: '#!/usr/bin/env node' },
    },
  },
  ssr: { noExternal: true },
});
