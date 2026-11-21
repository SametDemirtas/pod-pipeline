import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const uiRoot = resolve(import.meta.dirname, '../ui');

export default defineConfig({
  main: {
    build: {
      // Every package is a dev dependency and bundled, so the installed app carries no node_modules.
      externalizeDeps: true,
      rollupOptions: { input: resolve(import.meta.dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    build: {
      // Sandboxed preload scripts cannot load modules at run time.
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: uiRoot,
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(uiRoot, 'index.html') },
    },
  },
});
