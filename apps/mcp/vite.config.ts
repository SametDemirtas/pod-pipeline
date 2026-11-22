import { defineConfig } from 'vite';

/** Bundles the server into one module with no runtime dependencies, which the app loads. */
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'index.js' },
    },
  },
  ssr: { noExternal: true },
});
