import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tool-registration.js';
import type { CatalogApi } from '@pod/contracts/client';
import { LISTING_LIMITS } from '@pod/rules';
import { withProgress } from '../progress.js';
import { respond } from '../respond.js';
import { inputs, outputs } from '../schemas.js';
import { readOnly, writes } from '../annotations.js';

function researchEtsy(server: McpServer, api: Pick<CatalogApi, 'researchKeywords'>): void {
  server.registerTool(
    'research_etsy',
    {
      title: 'Research Etsy',
      description:
        'Searches Etsy for a query like a signed-out buyer in one market, in a hidden browser ' +
        'window of the app, and counts what the first page of results says: phrases ' +
        'competitors use in titles (with how many shops use them, whether Etsy suggests them ' +
        'and whether they name a trademark), prices, ads and badges. Etsy shows no search ' +
        `volume, so none is given. report.suggestedTags holds up to ${LISTING_LIMITS.tags} tags the app picked ` +
        'from those terms, fewer when the search has no more good ones; report.writerWords ' +
        'holds the strongest terms for the title and description, the query first. Both ' +
        'leave out trademarks; use only terms that are not trademarks. A warning ' +
        "otherCurrency means Etsy showed prices in another currency than the market's. A " +
        'term with adOnly true is used only by ads, shown because the search found few ' +
        'results; take it as a weaker hint. If ' +
        'Etsy asks to prove a person is searching, the window opens and the user has to pass ' +
        'the check there. Keep searches few; each is a page view on Etsy.',
      inputSchema: {
        query: inputs.researchQuery.describe('What a buyer would type, e.g. tulip mug'),
        market: inputs.researchMarket
          .optional()
          .describe('Where buyers shop: US (default), GB or DE; search in its language'),
      },
      outputSchema: outputs.researchRun,
      annotations: writes({ idempotent: false, destructive: false, openWorld: true }),
    },
    ({ query, market }, extra) =>
      respond(
        withProgress(
          extra,
          'Still searching Etsy; it may be waiting for the user to pass a check in the window',
          api.researchKeywords(market === undefined ? { query } : { query, market }),
        ),
      ),
  );
}

function listResearch(server: McpServer, api: Pick<CatalogApi, 'listResearch'>): void {
  server.registerTool(
    'list_research',
    {
      title: 'List research',
      description: 'Earlier Etsy searches, newest first, with their top terms.',
      outputSchema: outputs.researchList,
      annotations: readOnly(false),
    },
    () => respond(api.listResearch().then((runs) => ({ runs }))),
  );
}

function getResearch(server: McpServer, api: Pick<CatalogApi, 'getResearch'>): void {
  server.registerTool(
    'get_research',
    {
      title: 'Get research',
      description: 'One earlier Etsy search with its full report.',
      inputSchema: { id: inputs.researchId.describe('Run id from list_research') },
      outputSchema: outputs.researchRun,
      annotations: readOnly(false),
    },
    ({ id }) => respond(api.getResearch({ id })),
  );
}

/** Etsy market research: search like a signed-out buyer and count what the results say. */
export function registerResearchTools(
  server: McpServer,
  api: Pick<CatalogApi, 'researchKeywords' | 'listResearch' | 'getResearch'>,
): void {
  registerTools(server, api, [researchEtsy, listResearch, getResearch]);
}
