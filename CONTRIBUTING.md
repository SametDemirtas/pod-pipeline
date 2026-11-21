# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

You need Node.js 24 (see `.nvmrc`).

```sh
npm install
npm run fetch:upscaler   # Real-ESRGAN for your system, needed for upscaling
npm run dev --workspace @pod/desktop
```

Set `POD_DATA_DIR` to a folder of your choice so development data stays apart from your own.

## Before opening a pull request

```sh
# formatting, lint, unused code, types and unit tests; coverage must stay above the thresholds
# in vitest.config.ts
npm run format:check && npm run lint && npm run knip && npm run typecheck && npm run test:coverage
# licenses of the bundled packages; run `npm run notices` after changing dependencies
npm run notices -- --check
npm run test:research-samples   # after changing how research counts terms; review the diff
npm run test:e2e                # builds the app and runs the end-to-end tests
```

## How the code is organised

- Business rules live in `packages/core` and depend only on the ports defined there and on
  `packages/rules`. Lint rules stop the core from importing Electron, Node's file system or any
  adapter.
- `packages/rules` holds pure rules that the core, the desktop app, the window and the MCP server
  all use, such as Etsy's listing limits and one profile per product family. It imports nothing
  but the shapes and constants in `@pod/contracts/client`.
- Services in `apps/desktop/src/main/application` that build on other features, such as preparing
  listings in a batch, turning or upscaling artwork, call them through the `CatalogApi` facade
  rather than the core use cases. The services behind the facade keep work such as making
  mockups or a listing draft from running twice at once and pace searches on Etsy, so going
  around it would skip both.
- Each outside service has its own adapter package. Adapters are wired together only in
  `apps/desktop/src/main/composition`, and the desktop app's own infrastructure (files, storage,
  windows, sign-in, shutdown) lives in its own folders next to it, not in `composition`.
- An adapter that reaches a service exports how it reads that service's errors, built with
  `serviceFailures` from `@pod/adapter-http`. `composition/provider-registry.ts` lists every
  such adapter once, with the error the seller sees when the service needs connecting again.
- Every request from the window, the local API or the MCP server is validated with the schemas in
  `packages/contracts`.
- A storage adapter must pass the same contract tests as the in-memory one in
  `packages/core/src/testing`.
- New interface text needs English, Turkish and German; a test checks that all three have the same
  keys.

Keep changes small and focused, with tests for the behaviour they add or fix. Write commit
messages that say what changed and why.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Live services

Tests never call Printful, Etsy, Pinterest, Dropbox, any AI service or any other outside
service. When you try a change against a real account, use a test shop or board, and remember
that publishing an Etsy listing costs a listing fee.
