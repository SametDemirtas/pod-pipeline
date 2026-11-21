# Security

## Reporting a problem

Please report security problems privately through
[GitHub's private vulnerability reporting](../../security/advisories/new), not in a public
issue. Say what is affected, how to reproduce it and what an attacker could do. You will get an
answer within a week.

## What the app protects

- **Keys and sign-ins** (Printful, Dropbox or S3, Etsy, Pinterest, and every AI service key:
  Anthropic, OpenAI, Gemini, DeepSeek and Kimi) are encrypted with the system keychain and never
  leave the main process. The window and the local API cannot read them.
- **The local API** listens on `127.0.0.1` only and needs a random token the app writes to its
  data folder, readable by the current user only.
- **AI assistants** reach the app only through that API. They can import only from folders the
  user chose in the app. They can create unpublished Etsy drafts, which Etsy does not charge for,
  and link them to Printful, but they cannot publish on Etsy or Pinterest, spend the user's credit
  at any AI service, start batches or upscale artwork.
- **The app's binary** cannot run as plain Node (the Electron `RunAsNode` fuse is off), so other
  programs cannot use it to run their own code under the app's identity. MCP clients start it
  with `--mcp-server`, which runs only the bundled MCP server.
- **The window** runs sandboxed with context isolation and talks to the main process through a
  fixed list of validated operations. Every request is validated before it reaches the
  application.
- **The Etsy research window** is sandboxed, has no permissions, cannot download, stays on Etsy
  and its human check, never signs in, and reads pages from an isolated JavaScript world.
- **Pin images** are rendered in an offscreen window without JavaScript or network access.

## Known trade-offs

- Thumbnails of PNGs above 40 million pixels are decoded in a worker thread, one at a time; if
  the worker fails, the main process decodes them instead. All other thumbnails are decoded in
  the main process. Imports refuse images above a pixel limit.
- The bundled MCP server's JavaScript sits next to the app archive, not inside it. On macOS the
  app's code signature covers it; elsewhere anyone who can write to the install folder can change
  it, as they could the app itself.

## Supported versions

Only the latest release gets security fixes.
