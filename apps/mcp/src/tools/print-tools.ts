import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CatalogApi } from '@pod/contracts/client';
import { readOnly, writes } from '../annotations.js';
import { compactPrintCheck, PRINT_INPUT, printRequestOf } from '../inputs/print-input.js';
import { withProgress } from '../progress.js';
import { respond } from '../respond.js';
import { DESIGN, outputs } from '../schemas.js';
import { registerTools } from './tool-registration.js';

function checkPrint(server: McpServer, api: Pick<CatalogApi, 'checkPrint'>): void {
  server.registerTool(
    'check_print',
    {
      title: 'Check print',
      description:
        'How a design prints on one print area of a variant of its Printful product: the ' +
        'variants with their colour, size and print areas, where the design lands, its ' +
        'effective DPI and a quality rating (good, acceptable, poor), and the product facts ' +
        'the user keeps in the app (productFacts: material, care, fit, size; empty when ' +
        'unknown), the only facts listing text may state. Show poor ratings to the user ' +
        'before making mockups: the artwork needs more pixels, which the user can get with ' +
        'Upscale 4× on the design page of the app, or by importing a larger file.',
      inputSchema: PRINT_INPUT,
      outputSchema: outputs.printCheck,
      annotations: readOnly(true),
    },
    (input) => respond(api.checkPrint(printRequestOf(input)).then(compactPrintCheck)),
  );
}

function createMockups(server: McpServer, api: Pick<CatalogApi, 'createMockups'>): void {
  server.registerTool(
    'create_mockups',
    {
      title: 'Create mockups',
      description:
        'Has Printful render product images of the design on one print area of a variant and ' +
        'stores them in the app, replacing the earlier images of that variant and area. ' +
        'Free, but takes up to two minutes. The design is uploaded to the connected file host ' +
        'under a temporary link, which is deleted when Printful is done. Each image has ' +
        'createdAt, so list_mockups shows whether a run that timed out has finished.',
      inputSchema: PRINT_INPUT,
      outputSchema: outputs.mockups,
      annotations: writes({ idempotent: false, destructive: true, openWorld: true }),
    },
    (input, extra) =>
      respond(
        withProgress(
          extra,
          'Printful is still rendering the mockups',
          api.createMockups(printRequestOf(input)),
        ).then((mockups) => ({ mockups })),
      ),
  );
}

function listMockups(server: McpServer, api: Pick<CatalogApi, 'listMockups'>): void {
  server.registerTool(
    'list_mockups',
    {
      title: 'List mockups',
      description: 'Product images stored for a design, newest first, each with createdAt.',
      inputSchema: DESIGN,
      outputSchema: outputs.mockups,
      annotations: readOnly(false),
    },
    ({ design_id }) => respond(api.listMockups({ id: design_id }).then((mockups) => ({ mockups }))),
  );
}

/** Print checks and Printful mockups. */
export function registerPrintTools(
  server: McpServer,
  api: Pick<CatalogApi, 'checkPrint' | 'createMockups' | 'listMockups'>,
): void {
  registerTools(server, api, [checkPrint, createMockups, listMockups]);
}
