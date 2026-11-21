import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/testing/**',
        // Barrels that only re-export, and the MCP server's stdio entry.
        'packages/*/src/index.ts',
        'packages/contracts/src/requests/index.ts',
        'apps/mcp/src/index.ts',
        '**/vitest.config.ts',
        '**/test/**',
        'apps/ui/src/main.tsx',
        // Electron-only glue, exercised by the end-to-end tests.
        'apps/desktop/src/main/index.ts',
        'apps/desktop/src/main/composition/start-desktop.ts',
        'apps/desktop/src/main/composition/png-worker.ts',
        'apps/desktop/src/main/lifecycle/mcp-server.ts',
        'apps/desktop/src/main/window/application-menu.ts',
        'apps/desktop/src/main/window/closing-window.ts',
        'apps/desktop/src/main/window/default-session.ts',
        'apps/desktop/src/main/window/main-window.ts',
        'apps/desktop/src/main/window/open-in-browser.ts',
        'apps/desktop/src/main/window/pin-composer-window.ts',
        'apps/desktop/src/main/window/research-window.ts',
        'apps/desktop/src/main/window/window-bridge.ts',
        'apps/desktop/src/main/assets/asset-protocol.ts',
        'apps/desktop/src/preload/**',
      ],
      thresholds: { lines: 97, functions: 98, statements: 95, branches: 90 },
    },
  },
});
