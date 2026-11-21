import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, type ApiErrorCode } from '@pod/contracts/client';
import { AppNotRunningError, AppVersionMismatchError } from './connection.js';

const NEXT_STEPS: Partial<Record<ApiErrorCode, string>> = {
  INVALID_REQUEST:
    'Fix the arguments at the paths in details.issues (each tool argument is the snake_case ' +
    'form of its name there), then call again; nothing was changed.',
  VALIDATION:
    'Fix the argument named in details.field (the tool argument is its snake_case form), ' +
    'then call again.',
  CONFLICT: 'Something else is changing the same design right now; wait a minute, then try again.',
  IMPORT_SOURCE_UNREADABLE:
    'The app could not read that folder; ask the user to check that it exists and is not ' +
    'on a disconnected drive.',
  IMPORT_IN_PROGRESS: 'Wait until the running import finishes, then try again.',
  IMPORT_PLAN_CHANGED: 'Call preview_import again and use the new fingerprint.',
  IMPORT_FOLDER_NOT_APPROVED:
    'Ask the user to choose the folder in the app (Import designs, Choose folder); ' +
    'list_import_folders shows the folders already allowed.',
  IMPORT_NOTHING_TO_DO: 'Everything in the folder is already imported.',
  PRINT_PRODUCT_UNAVAILABLE:
    'This product cannot be printed yet; call list_designs with another family_id.',
  PRINT_VARIANT_UNAVAILABLE:
    'Printful has a variant of this listing out of stock; nothing was linked. Try ' +
    'link_printful again later.',
  NOT_FOUND:
    'Check the id against list_designs, list_mockups, list_research or list_pins; for a ' +
    'variant, call check_print without variant_id to see valid ones.',
  PRINTFUL_NOT_CONNECTED: 'Ask the user to connect Printful in the app (Settings, Connections).',
  FILE_HOST_NOT_CONNECTED:
    'Ask the user to connect Dropbox or Cloudflare R2 in the app (Settings, Connections).',
  MOCKUPS_IN_PROGRESS: 'Wait until the running mockups are ready, then call list_mockups.',
  PROVIDER_FAILED: 'Printful, Etsy, Pinterest or the file host failed; try again in a minute.',
  PROVIDER_BUSY:
    'The service in details.service is busy or rate limited and nothing was done; wait the ' +
    'seconds in details.retryAfterSeconds, or a minute when it is missing, then try again.',
  PROVIDER_INTERRUPTED:
    'The connection to the service in details.service broke off after the request was sent, ' +
    'so it may have done the work and charged for it. Check with the matching list_ or get_ ' +
    'tool before calling again.',
  PRINT_FILE_TOO_LARGE:
    'The print file is larger than Printful takes; ask the user to import a smaller file ' +
    'for the design. Nothing was linked.',
  SECRET_STORAGE_UNAVAILABLE:
    'The system keychain is locked or missing; ask the user to unlock it, then try again.',
  INTERNAL: 'Something went wrong in the app; try again once, then ask the user to check it.',
  APP_CLOSING: 'The app is closing; ask the user to open it again, then try again.',
  APP_OUTCOME_UNKNOWN:
    'The app may have done the work anyway. Check with the matching list_ or get_ tool ' +
    'before calling again, so nothing is done twice.',
  ETSY_NOT_CONNECTED: 'Ask the user to connect Etsy in the app (Settings, Connections).',
  LISTING_EXISTS: 'The design already has a listing; call get_listing and change it on Etsy.',
  DRAFT_UNCONFIRMED:
    'Etsy may have created the draft anyway. Ask the user to look for it among the drafts on ' +
    'Etsy and delete it there, then choose "I checked my drafts" in the app; call ' +
    'create_etsy_draft again only after that.',
  DRAFT_LEFT_BEHIND:
    'The draft whose id is details.marketplaceId is still on Etsy. Ask the user to delete it ' +
    'there, then choose "I checked my drafts" in the app; call create_etsy_draft again only ' +
    'after that.',
  DRAFTS_NOT_CHECKED:
    'A draft of this design may be on Etsy. Ask the user to check the drafts on Etsy, delete ' +
    'a leftover one, then choose "I checked my drafts" in the app; call create_etsy_draft ' +
    'again only after that.',
  OTHER_BRAND_NAMED:
    'The text names details.brands, a brand this product does not fit (an iPhone case must not ' +
    'name Samsung, a Samsung case not the iPhone). Rewrite the title, description and tags in ' +
    'every language without it, then call create_etsy_draft again.',
  SHIPPING_PROFILE_GONE:
    'The shipping profile chosen in the app for the product in details.familyId is no longer ' +
    'in the Etsy shop. Ask the user to choose another one in the app (Settings).',
  SHOP_CURRENCY_CHANGED:
    "The shop's currency is now details.currency. Call get_shop_options, ask the user for the " +
    'prices in that currency, then call create_etsy_draft again.',
  LISTING_NOT_SYNCED:
    'Printful has not imported the listing yet. Ask the user to check that store sync is on ' +
    'in Printful, then call link_printful again in a minute.',
  PRINTFUL_STORE_NOT_ETSY:
    'The Printful token belongs to details.store, a store not connected to any Etsy shop, so ' +
    'Printful never imports the listing. Ask the user to connect Printful in the app ' +
    '(Settings, Connections) with a token for the store synced with details.shop; do not retry.',
  PRINTFUL_STORE_OTHER_SHOP:
    'The Printful token belongs to details.store, which does not look like the store synced ' +
    'with the Etsy shop details.shop. Ask the user to check the token in the app (Settings, ' +
    'Connections), then call link_printful again.',
  LISTING_IN_PROGRESS: 'Wait until the running listing change finishes, then call get_listing.',
  LISTING_NOT_DRAFT:
    'The listing is published, or was deleted, on Etsy (details.state); its photos are only ' +
    'replaced while it is a draft. Ask the user to change them on Etsy; call refresh_listing.',
  PINTEREST_NOT_CONNECTED: 'Ask the user to connect Pinterest in the app (Settings, Connections).',
  PIN_IN_PROGRESS: 'Wait until the running pin is made, then call list_pins and try again.',
  RESEARCH_IN_PROGRESS: 'Wait until the running search finishes, then call list_research.',
  RESEARCH_RATE_LIMITED:
    'Etsy wants fewer searches; wait the seconds in details.retryAfterSeconds before the next one.',
  RESEARCH_BLOCKED:
    'Ask the user to watch the Etsy window the app opens and pass the check, then try again.',
  RESEARCH_CANCELLED: 'The user closed the Etsy window; ask before searching again.',
  RESEARCH_PAGE_CHANGED:
    "Etsy changed its search page and the app cannot read it; don't retry, tell the user.",
};

/** Returns the value as structured content with a compact JSON copy, or a tool error. */
export async function respond(work: Promise<object>): Promise<CallToolResult> {
  try {
    const value = await work;
    return {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: value as Record<string, unknown>,
    };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: describe(error) }] };
  }
}

function describe(error: unknown): string {
  if (error instanceof AppNotRunningError || error instanceof AppVersionMismatchError) {
    return error.message;
  }
  if (!(error instanceof ApiError)) return 'The app could not complete the request.';

  const lines = [`${error.code}: ${error.message}`];
  const nextStep = NEXT_STEPS[error.code];
  if (nextStep) lines.push(nextStep);
  if (Object.keys(error.details).length > 0)
    lines.push(`Details: ${JSON.stringify(error.details)}`);
  return lines.join('\n');
}
