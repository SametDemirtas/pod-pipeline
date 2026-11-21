import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tool-registration.js';
import { type CatalogApi } from '@pod/contracts/client';
import { LISTING_LIMITS } from '@pod/rules';
import { readOnly, writes } from '../annotations.js';
import { DRAFT_DESCRIPTION, DRAFT_INPUT, draftRequestOf } from '../inputs/draft-input.js';
import { DESIGN, inputs, outputs } from '../schemas.js';
import { withProgress } from '../progress.js';
import { respond } from '../respond.js';

function getShopOptions(server: McpServer, api: Pick<CatalogApi, 'getShopOptions'>): void {
  server.registerTool(
    'get_shop_options',
    {
      title: 'Get Etsy shop options',
      description:
        'Shipping profiles, processing times, return policies and production partners of the ' +
        'connected Etsy shop, and its currency with its decimal places (currencyDigits). ' +
        'create_etsy_draft needs ids and the price unit from here; ' +
        'when there is more than one choice, ask the user which to use.',
      outputSchema: outputs.shopOptions,
      annotations: readOnly(true),
    },
    () => respond(api.getShopOptions()),
  );
}

function getListing(server: McpServer, api: Pick<CatalogApi, 'getListing'>): void {
  server.registerTool(
    'get_listing',
    {
      title: 'Get listing',
      description:
        "The design's Etsy listing: its id, state (draft, active or inactive), the variants it sells " +
        'and whether Printful was linked (linkedAt) to the current design revision ' +
        '(linkCurrent; when false, call link_printful again). listing is null when the design ' +
        'has none yet.',
      inputSchema: DESIGN,
      outputSchema: outputs.listingOrNone,
      annotations: readOnly(false),
    },
    ({ design_id }) => respond(api.getListing({ id: design_id }).then((listing) => ({ listing }))),
  );
}

function refreshListing(server: McpServer, api: Pick<CatalogApi, 'refreshListing'>): void {
  server.registerTool(
    'refresh_listing',
    {
      title: 'Refresh listing',
      description:
        "Reads the state of the design's listing on Etsy, where the user may have published, " +
        'paused or deleted it. listing is null when it was deleted; the design can then get a ' +
        'new draft.',
      inputSchema: DESIGN,
      outputSchema: outputs.listingOrNone,
      // It forgets a listing deleted on Etsy, so it is not read-only.
      annotations: writes({ idempotent: true, destructive: false, openWorld: true }),
    },
    ({ design_id }) =>
      respond(api.refreshListing({ id: design_id }).then((listing) => ({ listing }))),
  );
}

function getListingPhotos(server: McpServer, api: Pick<CatalogApi, 'listingPhotos'>): void {
  server.registerTool(
    'get_listing_photos',
    {
      title: 'Get listing photos',
      description:
        "What the design's listing shows now, read from Etsy and Printful without changing " +
        'anything: marketplace has the Etsy photos in their order, print the pictures Printful ' +
        'keeps of the linked print file (kind default is the print file). print is null while ' +
        'Printful has not picked up the listing yet.',
      inputSchema: DESIGN,
      outputSchema: outputs.listingPhotos,
      annotations: readOnly(true),
    },
    ({ design_id }) =>
      respond(
        // The small copies are for the window; an assistant gets the addresses only.
        api.listingPhotos({ id: design_id }).then(({ marketplace, print }) => ({
          marketplace: marketplace.map(({ url, width, height }) => ({ url, width, height })),
          print: print?.map(({ kind, url }) => ({ kind, url })) ?? null,
        })),
      ),
  );
}

function createEtsyDraft(server: McpServer, api: Pick<CatalogApi, 'createListing'>): void {
  server.registerTool(
    'create_etsy_draft',
    {
      title: 'Create Etsy draft',
      description: DRAFT_DESCRIPTION,
      inputSchema: DRAFT_INPUT,
      outputSchema: outputs.createdListing,
      annotations: writes({ idempotent: false, destructive: false, openWorld: true }),
    },
    (input, extra) =>
      respond(
        withProgress(
          extra,
          'Still creating the draft and uploading the photos',
          api.createListing(draftRequestOf(input)),
        ),
      ),
  );
}

function linkPrintful(server: McpServer, api: Pick<CatalogApi, 'linkListing'>): void {
  server.registerTool(
    'link_printful',
    {
      title: 'Link Printful',
      description:
        "Tells Printful which product and print file each variant of the design's Etsy " +
        'listing is, so orders are made automatically. Printful must have imported the ' +
        'listing first, which it does by itself shortly after create_etsy_draft when store ' +
        'sync is on. Safe to repeat, e.g. after a new design revision.',
      inputSchema: DESIGN,
      outputSchema: outputs.listing,
      annotations: writes({ idempotent: true, destructive: false, openWorld: true }),
    },
    ({ design_id }, extra) =>
      respond(
        withProgress(extra, 'Still linking the variants', api.linkListing({ id: design_id })),
      ),
  );
}

function replaceEtsyDraftPhotos(
  server: McpServer,
  api: Pick<CatalogApi, 'replaceListingPhotos'>,
): void {
  server.registerTool(
    'replace_etsy_draft_photos',
    {
      title: 'Replace Etsy draft photos',
      description:
        "Replaces every photo of the design's unpublished Etsy draft with the chosen Printful " +
        'mockups, e.g. after create_mockups made new ones. The old photos are removed from the ' +
        'draft. Only works while the listing is a draft; AI scenes are refused, since the ' +
        'description of a draft made without them lacks the AI note. Confirm the photos with ' +
        'the user before calling. If it fails halfway the draft may lack photos; call it again.',
      inputSchema: {
        ...DESIGN,
        mockup_ids: inputs
          .listingItems(inputs.mockupId)
          .describe(
            `1 to ${String(LISTING_LIMITS.photos)} mockup ids from list_mockups of the current ` +
              'design revision, main photo first',
          ),
      },
      outputSchema: outputs.listing,
      // The draft's earlier photos are gone afterwards; sending the same photos again ends alike.
      annotations: writes({ idempotent: true, destructive: true, openWorld: true }),
    },
    ({ design_id, mockup_ids }, extra) =>
      respond(
        withProgress(
          extra,
          'Still uploading the photos',
          api.replaceListingPhotos({ designId: design_id, mockupIds: mockup_ids }),
        ),
      ),
  );
}

/** Etsy drafts and their Printful link. Publishing is left to the user in the app. */
export function registerListingTools(
  server: McpServer,
  api: Pick<
    CatalogApi,
    | 'getShopOptions'
    | 'getListing'
    | 'refreshListing'
    | 'listingPhotos'
    | 'createListing'
    | 'linkListing'
    | 'replaceListingPhotos'
  >,
): void {
  registerTools(server, api, [
    getShopOptions,
    getListing,
    refreshListing,
    getListingPhotos,
    createEtsyDraft,
    linkPrintful,
    replaceEtsyDraftPhotos,
  ]);
}
