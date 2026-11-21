import { builtinModules } from 'node:module';
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Syntax banned in every package and app. */
const PORTABLE_SYNTAX = [
  {
    selector:
      'CallExpression[callee.property.name=/^toLocale(Lower|Upper)Case$/][arguments.length=0]',
    message: 'Use toLowerCase()/toUpperCase() or name the locale.',
  },
  {
    selector:
      "CallExpression[callee.property.name=/^toLocale(Lower|Upper)Case$/][arguments.0.type='Identifier'][arguments.0.name='undefined']",
    message: 'Use toLowerCase()/toUpperCase() or name the locale.',
  },
  {
    selector: "CallExpression[callee.property.name='localeCompare'][arguments.length<2]",
    message: 'Name the locale, e.g. localeCompare(other, "en").',
  },
  {
    selector:
      "NewExpression[callee.object.name='Intl'][callee.property.name='Collator'][arguments.length=0]",
    message: 'Name the locale, e.g. new Intl.Collator("en").',
  },
  {
    selector:
      "CallExpression[callee.object.name='Intl'][callee.property.name='Collator'][arguments.length=0]",
    message: 'Name the locale, e.g. Intl.Collator("en").',
  },
  {
    selector:
      "NewExpression[callee.object.name='Intl'][callee.property.name='Collator'][arguments.0.type='Identifier'][arguments.0.name='undefined']",
    message: 'Name the locale, e.g. new Intl.Collator("en").',
  },
  {
    selector:
      "CallExpression[callee.object.name='Intl'][callee.property.name='Collator'][arguments.0.type='Identifier'][arguments.0.name='undefined']",
    message: 'Name the locale, e.g. Intl.Collator("en").',
  },
  {
    selector:
      "CallExpression[callee.property.name='localeCompare'][arguments.1.type='Identifier'][arguments.1.name='undefined']",
    message: 'Name the locale, e.g. localeCompare(other, "en").',
  },
  {
    // A loading Radix button is disabled and drops keyboard focus.
    selector:
      "JSXOpeningElement[name.name=/^(Button|IconButton)$/] > JSXAttribute[name.name='loading']",
    message: 'Use BusyButton or BusyIconButton, which keep focus while busy.',
  },
];
const ADAPTERS_OUTSIDE_COMPOSITION = {
  group: ['@pod/adapter-*'],
  message: 'Adapters are wired in apps/desktop/src/main/composition only.',
};
const NO_IO_MESSAGE = 'Inject file, network and Electron access from the composition root.';
/** Globals that tie code to one runtime or reach the outside world; pure code goes without. */
const IMPURE_GLOBALS = [
  'Buffer',
  'process',
  'require',
  '__dirname',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'clearTimeout',
  'clearInterval',
  'fetch',
  'crypto',
  'structuredClone',
];
const IMPURE_PROPERTIES = [
  { object: 'Date', property: 'now', message: 'Take the time from the Clock port.' },
  { object: 'performance', property: 'now', message: 'Take the time from the Clock port.' },
  { object: 'globalThis', property: 'fetch', message: 'Reach services through a port.' },
  { object: 'globalThis', property: 'setTimeout', message: 'Take timers from a port.' },
  { object: 'globalThis', property: 'setInterval', message: 'Take timers from a port.' },
  { object: 'globalThis', property: 'Date', message: 'Take the time from the Clock port.' },
  { object: 'AbortSignal', property: 'timeout', message: 'Take timers from a port.' },
  { object: 'Math', property: 'random', message: 'Take random values from a port.' },
];
/** A module loaded at run time escapes the import rules of its layer. */
const NO_DYNAMIC_IMPORT = {
  selector: 'ImportExpression',
  message: 'Import modules statically, so the layer rules can check them.',
};
const IMPURE_SYNTAX = [
  ...PORTABLE_SYNTAX,
  NO_DYNAMIC_IMPORT,
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Take the time from the Clock port.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/release/**',
      '**/node_modules/**',
      'spikes/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: [
      '**/*.js',
      '**/vitest.config.ts',
      '**/vite.config.ts',
      '**/electron.vite.config.ts',
      'playwright.config.ts',
    ],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Test doubles and fixtures are typed by what they return.
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/testing/**/*.ts',
      '**/test/**/*.ts',
      '**/e2e/**/*.ts',
    ],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  {
    // React components and hooks rely on inferred JSX and hook return types.
    files: ['apps/ui/src/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  {
    // Default-locale casing turns `I` into a dotless `ı` on a Turkish system.
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...PORTABLE_SYNTAX],
    },
  },
  {
    // Only the composition root of the desktop app chooses adapters.
    files: ['apps/desktop/src/**/*.ts'],
    ignores: ['apps/desktop/src/main/composition/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [ADAPTERS_OUTSIDE_COMPOSITION],
        },
      ],
    },
  },
  {
    // File helpers build on the file system adapter's primitives, e.g. renaming with retries.
    files: ['apps/desktop/src/main/files/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { ...ADAPTERS_OUTSIDE_COMPOSITION, group: ['@pod/adapter-*', '!@pod/adapter-fs'] },
          ],
        },
      ],
    },
  },
  {
    // Use cases and shared helpers do no I/O of their own; it is injected from outside.
    files: ['apps/desktop/src/main/{application,shared}/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', ...builtinModules.filter((name) => name !== 'path')].map((name) => ({
            name,
            message: NO_IO_MESSAGE,
          })),
          patterns: [
            ADAPTERS_OUTSIDE_COMPOSITION,
            { group: ['node:*', '!node:path'], message: NO_IO_MESSAGE },
          ],
        },
      ],
    },
  },
  {
    // Layers whose imports are restricted load nothing at run time.
    files: [
      'packages/contracts/src/**/*.ts',
      'apps/desktop/src/main/{application,shared}/**/*.ts',
      'apps/desktop/src/preload/**/*.ts',
      'apps/ui/src/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...PORTABLE_SYNTAX, NO_DYNAMIC_IMPORT],
    },
  },
  {
    // Use cases and shared helpers take time, timers and the network from the composition.
    files: ['apps/desktop/src/main/{application,shared}/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES],
      'no-restricted-syntax': ['error', ...IMPURE_SYNTAX],
    },
  },
  {
    // Packages run outside Electron too; only the desktop app may use it.
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'electron', message: 'Only apps/desktop may use Electron.' }] },
      ],
    },
  },
  {
    // Contracts are shared by the window, so they hold shapes and checks, never runtime code.
    files: ['packages/contracts/src/**/*.ts'],
    ignores: ['packages/contracts/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}(/|$)|zod$)',
              message: 'Contracts may only import zod and their own modules.',
            },
          ],
        },
      ],
    },
  },
  {
    // The window runs sandboxed in the renderer: no Node or Electron, only the preload API.
    files: ['apps/ui/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', ...builtinModules].map((name) => ({
            name,
            message: 'The window reaches the system only through the preload API.',
          })),
          patterns: [
            {
              group: ['node:*'],
              message: 'The window reaches the system only through the preload API.',
            },
          ],
        },
      ],
    },
  },
  {
    // The core is runtime-agnostic: it imports nothing but its own modules and the
    // shared rules, so it runs unchanged in Electron, Node and tests.
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/**/*.test.ts', 'packages/core/src/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}(/|$)|@pod/rules$)',
              message: 'The core may only import its own modules and @pod/rules.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES],
      'no-restricted-syntax': ['error', ...IMPURE_SYNTAX],
    },
  },
  {
    // Rules shared by the core and every client: pure functions over the contracts' shapes.
    files: ['packages/rules/src/**/*.ts'],
    ignores: ['packages/rules/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}(/|$)|@pod/contracts/client$)',
              message: 'The rules may only import their own modules and @pod/contracts/client.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES],
      'no-restricted-syntax': ['error', ...IMPURE_SYNTAX],
    },
  },
  {
    // Contracts are shared by every runtime, so they hold no clocks, timers or I/O.
    files: ['packages/contracts/src/**/*.ts'],
    ignores: ['packages/contracts/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', ...IMPURE_PROPERTIES],
      'no-restricted-syntax': ['error', ...IMPURE_SYNTAX],
    },
  },
  {
    // Small files and functions; tests, translations and table definitions are long by nature.
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx', 'scripts/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/e2e/**',
      'apps/ui/src/i18n/locales/**',
      'packages/adapter-sqlite/src/schema.ts',
    ],
    rules: {
      'max-lines': ['error', { max: 300 }],
      'max-lines-per-function': ['error', { max: 60 }],
    },
  },
  {
    // A React component keeps its hooks and markup together, so it may run a little longer.
    files: ['apps/ui/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: { 'max-lines-per-function': ['error', { max: 80 }] },
  },
  {
    // Architectural layers: the core must stay free of infrastructure so every
    // adapter can be swapped without touching business rules.
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'core', pattern: 'packages/core' },
        { type: 'contracts', pattern: 'packages/contracts' },
        { type: 'rules', pattern: 'packages/rules' },
        { type: 'adapter-http', pattern: 'packages/adapter-http' },
        { type: 'shared-adapter', pattern: 'packages/adapter-ai' },
        { type: 'adapter-fs', pattern: 'packages/adapter-fs' },
        { type: 'adapter', pattern: 'packages/adapter-*' },
        // Layers of the desktop main process; the first matching pattern wins.
        { type: 'desktop-application', pattern: 'apps/desktop/src/main/application' },
        { type: 'desktop-shared', pattern: 'apps/desktop/src/main/shared' },
        { type: 'desktop-composition', pattern: 'apps/desktop/src/main/composition' },
        { type: 'desktop-testing', pattern: 'apps/desktop/src/main/testing' },
        { type: 'desktop-infra', pattern: 'apps/desktop/src/main/*' },
        { type: 'desktop-preload', pattern: 'apps/desktop/src/preload' },
        { type: 'app-desktop', pattern: 'apps/desktop' },
        { type: 'app-ui', pattern: 'apps/ui' },
        { type: 'app-mcp', pattern: 'apps/mcp' },
      ],
      'boundaries/files': [{ category: 'test', pattern: '**/*.test.ts' }],
      // Re-exports and run-time imports cross layers as much as imports do.
      'boundaries/dependency-nodes': ['import', 'export', 'dynamic-import'],
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'core' } },
              allow: { to: { element: { types: { anyOf: ['core', 'rules'] } } } },
            },
            {
              from: { element: { type: 'contracts' } },
              allow: { to: { element: { types: { anyOf: ['contracts'] } } } },
            },
            {
              from: { element: { type: 'rules' } },
              allow: { to: { element: { types: { anyOf: ['rules', 'contracts'] } } } },
            },
            {
              // HTTP helpers every adapter builds on; they build on nothing but the core.
              from: { element: { type: 'adapter-http' } },
              allow: { to: { element: { types: { anyOf: ['adapter-http', 'core'] } } } },
            },
            {
              // Helpers the AI adapters share; they know no single service.
              from: { element: { type: 'shared-adapter' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['shared-adapter', 'adapter-http', 'core', 'rules'] },
                  },
                },
              },
            },
            {
              // An adapter never uses another service's adapter, only the shared ones.
              from: { element: { types: { anyOf: ['adapter', 'adapter-fs'] } } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['shared-adapter', 'adapter-http', 'core', 'rules'] },
                  },
                },
              },
            },
            {
              // Use cases of the desktop app; they own the interfaces the infrastructure implements.
              from: { element: { type: 'desktop-application' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'desktop-application',
                        'desktop-shared',
                        'core',
                        'rules',
                        'contracts',
                      ],
                    },
                  },
                },
              },
            },
            {
              // Tests set use cases up with the doubles in testing/.
              from: { element: { type: 'desktop-application' }, file: { categories: 'test' } },
              allow: {
                to: { element: { types: { anyOf: ['desktop-testing'] } } },
              },
            },
            {
              from: { element: { type: 'desktop-shared' } },
              allow: {
                to: {
                  element: { types: { anyOf: ['desktop-shared', 'core', 'rules', 'contracts'] } },
                },
              },
            },
            {
              // Files, storage, windows and IPC: they implement or drive the application.
              from: { element: { type: 'desktop-infra' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'adapter-fs',
                        'desktop-infra',
                        'desktop-application',
                        'desktop-shared',
                        'core',
                        'rules',
                        'contracts',
                      ],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'desktop-infra' }, file: { categories: 'test' } },
              allow: { to: { element: { types: { anyOf: ['desktop-testing'] } } } },
            },
            {
              // The composition root, test setup and entry points wire everything together.
              from: {
                element: {
                  types: { anyOf: ['desktop-composition', 'desktop-testing', 'app-desktop'] },
                },
              },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'desktop-application',
                        'desktop-shared',
                        'desktop-composition',
                        'desktop-testing',
                        'desktop-infra',
                        'app-desktop',
                        'core',
                        'rules',
                        'contracts',
                        'adapter',
                        'adapter-fs',
                        'shared-adapter',
                        'adapter-http',
                      ],
                    },
                  },
                },
              },
            },
            {
              // The preload script runs beside the window and shares only the contracts with it.
              from: { element: { type: 'desktop-preload' } },
              allow: { to: { element: { types: { anyOf: ['desktop-preload', 'contracts'] } } } },
            },
            {
              from: { element: { type: 'app-ui' } },
              allow: { to: { element: { types: { anyOf: ['app-ui', 'rules', 'contracts'] } } } },
            },
            {
              from: { element: { type: 'app-mcp' } },
              allow: { to: { element: { types: { anyOf: ['app-mcp', 'rules', 'contracts'] } } } },
            },
          ],
        },
      ],
    },
  },
);
