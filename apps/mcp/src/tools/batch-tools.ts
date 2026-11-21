import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CatalogApi } from '@pod/contracts/client';
import { readOnly } from '../annotations.js';
import { respond } from '../respond.js';
import { outputs } from '../schemas.js';
import { registerTools } from './tool-registration.js';

function getBatchStatus(server: McpServer, api: Pick<CatalogApi, 'getBatchStatus'>): void {
  server.registerTool(
    'get_batch_status',
    {
      title: 'Get batch status',
      description:
        'How far the app got preparing listings for many designs: print check, Printful ' +
        'mockups, keywords from saved research and imported eRank lists (it never searches ' +
        'Etsy), listing text with translations and unpublished Etsy drafts. ' +
        'Gives counts per step, the design and step running now, and each design that ' +
        'stopped with its error code and message. job is null before the first run. Only ' +
        'the user can start, cancel, resume or retry it, in the app, since writing the ' +
        'text is billed to their AI key; nothing is ever published.',
      outputSchema: outputs.batchStatus,
      annotations: readOnly(false),
    },
    () => respond(api.getBatchStatus()),
  );
}

/** How far preparing listings for many designs got; only the user starts it, in the app. */
export function registerBatchTools(
  server: McpServer,
  api: Pick<CatalogApi, 'getBatchStatus'>,
): void {
  registerTools(server, api, [getBatchStatus]);
}
