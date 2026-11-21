import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/** A tool that changes nothing; `openWorld` when it asks Printful, Etsy or Pinterest. */
export function readOnly(openWorld: boolean): ToolAnnotations {
  return { readOnlyHint: true, idempotentHint: true, openWorldHint: openWorld };
}

/** A tool that changes something in the app or at a provider. */
export function writes({
  idempotent,
  destructive,
  openWorld,
}: {
  readonly idempotent: boolean;
  readonly destructive: boolean;
  readonly openWorld: boolean;
}): ToolAnnotations {
  return {
    readOnlyHint: false,
    destructiveHint: destructive,
    idempotentHint: idempotent,
    openWorldHint: openWorld,
  };
}
