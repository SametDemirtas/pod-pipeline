import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tool-registration.js';
import { type CatalogApi } from '@pod/contracts/client';
import { PIN_TEXT_LIMITS } from '@pod/rules';
import { withProgress } from '../progress.js';
import { respond } from '../respond.js';
import { DESIGN, inputs, outputs } from '../schemas.js';
import { readOnly, writes } from '../annotations.js';

function listBoards(server: McpServer, api: Pick<CatalogApi, 'listBoards'>): void {
  server.registerTool(
    'list_pinterest_boards',
    {
      title: 'List Pinterest boards',
      description: 'Boards of the Pinterest account connected in the app, to propose pins on.',
      outputSchema: outputs.boards,
      annotations: readOnly(true),
    },
    () => respond(api.listBoards().then((boards) => ({ boards }))),
  );
}

function listPins(server: McpServer, api: Pick<CatalogApi, 'listPins'>): void {
  server.registerTool(
    'list_pins',
    {
      title: 'List pins',
      description:
        "A design's pins, soonest first: proposed ones waiting for the user's approval, " +
        'planned ones with their time, published ones with their Pinterest link, and failed ' +
        'ones with the reason.',
      inputSchema: DESIGN,
      outputSchema: outputs.pins,
      annotations: readOnly(false),
    },
    ({ design_id }) => respond(api.listPins({ id: design_id }).then((pins) => ({ pins }))),
  );
}

function proposePin(server: McpServer, api: Pick<CatalogApi, 'proposePin'>): void {
  server.registerTool(
    'propose_pin',
    {
      title: 'Propose a pin',
      description:
        "Proposes a Pinterest pin of one of the design's photos (see list_mockups). The app " +
        'lays the photo out as a tall 1000 × 1500 pin with the headline printed on it. Nothing ' +
        'is published: the user approves the proposal in the app, and it goes out at ' +
        'publish_at while the app runs. Limits: ' +
        `title ${String(PIN_TEXT_LIMITS.title)}, description ${String(PIN_TEXT_LIMITS.description)}, ` +
        `alt text ${String(PIN_TEXT_LIMITS.altText)} and headline ${String(PIN_TEXT_LIMITS.headline)} ` +
        'characters. Once the Etsy listing is active the pin links to it.',
      inputSchema: {
        ...DESIGN,
        mockup_id: inputs.mockupId.describe(
          'Mockup id from list_mockups. An AI scene is accepted only with printConfirmed true, ' +
            'which the user sets in the app.',
        ),
        title: inputs.pinText.describe(
          'Starts with the main phrase buyers search for; 40 to 100 characters',
        ),
        description: inputs.pinText.describe(
          'One or two plain sentences with two or three search phrases; no hashtag lists',
        ),
        alt_text: inputs.pinText.describe(
          'Literally what the image shows, for people who cannot see it',
        ),
        headline: inputs.pinText.describe('Printed on the pin; empty for none'),
        board_id: inputs.boardId.describe('Board id from list_pinterest_boards'),
        publish_at: inputs.publishAt.describe('When to publish, e.g. 2026-11-02T18:00:00+01:00'),
      },
      outputSchema: outputs.pin,
      annotations: writes({ idempotent: false, destructive: false, openWorld: false }),
    },
    (input, extra) =>
      respond(
        withProgress(
          extra,
          'Still making the pin image',
          api.proposePin({
            designId: input.design_id,
            mockupId: input.mockup_id,
            title: input.title,
            description: input.description,
            altText: input.alt_text,
            headline: input.headline,
            boardId: input.board_id,
            publishAt: input.publish_at,
          }),
        ),
      ),
  );
}

/** Pinterest pins: assistants read boards and pins and propose new ones; only the user publishes. */
export function registerPinTools(
  server: McpServer,
  api: Pick<CatalogApi, 'listBoards' | 'listPins' | 'proposePin'>,
): void {
  registerTools(server, api, [listBoards, listPins, proposePin]);
}
