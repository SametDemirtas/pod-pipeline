import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CatalogApi } from '@pod/contracts/client';
import { readOnly } from '../annotations.js';
import { respond } from '../respond.js';
import { DESIGN, inputs, outputs } from '../schemas.js';
import { registerTools } from './tool-registration.js';

function listProductFamilies(server: McpServer, api: Pick<CatalogApi, 'listFamilies'>): void {
  server.registerTool(
    'list_product_families',
    {
      title: 'List product families',
      description:
        'Product families the catalog knows. The id is what list_designs expects as ' +
        'family_id and the end of every design key (01-mug is the mug of concept 01).',
      outputSchema: outputs.families,
      annotations: readOnly(false),
    },
    () => respond(api.listFamilies().then((families) => ({ families }))),
  );
}

function listDesigns(server: McpServer, api: Pick<CatalogApi, 'listDesigns'>): void {
  server.registerTool(
    'list_designs',
    {
      title: 'List designs',
      description:
        'Imported designs in catalog order: by concept number, then design key, so 99-mug ' +
        'comes before 100-mug. Returns one page; while nextCursor is not null, pass it as ' +
        'cursor to get the next page. Filter by family_id or by text in design keys and ' +
        'concept names.',
      inputSchema: {
        family_id: inputs.familyId.optional().describe('Product family id, e.g. "mug"'),
        search: inputs.search.optional().describe('Text in design keys or concept names'),
        limit: inputs.limit.optional().describe('Page size, 24 when left out'),
        cursor: inputs.cursor.optional().describe('nextCursor of the previous page'),
      },
      outputSchema: outputs.designPage,
      annotations: readOnly(false),
    },
    ({ family_id, search, limit, cursor }) =>
      respond(api.listDesigns({ familyId: family_id, search, limit, cursor })),
  );
}

function getDesign(server: McpServer, api: Pick<CatalogApi, 'getDesign'>): void {
  server.registerTool(
    'get_design',
    {
      title: 'Get design',
      description:
        'One design with its concept, image details and every stored revision. upscaleModel ' +
        'names the model that made a revision 4× larger in the app; null for artwork as imported.',
      inputSchema: DESIGN,
      outputSchema: outputs.design,
      annotations: readOnly(false),
    },
    ({ design_id }) => respond(api.getDesign({ id: design_id })),
  );
}

/** The catalog's product families and designs. */
export function registerCatalogTools(
  server: McpServer,
  api: Pick<CatalogApi, 'listFamilies' | 'listDesigns' | 'getDesign'>,
): void {
  registerTools(server, api, [listProductFamilies, listDesigns, getDesign]);
}
