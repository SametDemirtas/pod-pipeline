import {
  ApiError,
  localApiPath,
  type ApiErrorCode,
  unwrapResult,
  type ApiResult,
  type CatalogApi,
  type LocalApiConnection,
} from '@pod/contracts/client';
import { AppNotRunningError } from './connection.js';
import { patientFetch } from './patient-fetch.js';

export type ConnectionSource = () => Promise<LocalApiConnection>;

interface OperationTiming {
  readonly timeoutMs: number;
  /** What to do when no answer arrived: the app may still be working on the request. */
  readonly unanswered: string;
}

const MINUTE = 60_000;
/** Reads answer quickly. */
const READ: OperationTiming = { timeoutMs: 30_000, unanswered: 'It may be busy; try again later.' };
/** Uploading photos to Etsy, or waiting for Printful to fetch a print file, takes minutes. */
const LISTING: OperationTiming = {
  timeoutMs: 5 * MINUTE,
  unanswered: 'It may still be working on the listing; check get_listing before trying again.',
};

const OPERATIONS: Readonly<Record<keyof CatalogApi, OperationTiming>> = {
  listFamilies: READ,
  listDesigns: READ,
  getDesign: READ,
  listImportFolders: READ,
  // An import reads, and then copies, every file of the folder.
  previewImport: {
    timeoutMs: 15 * MINUTE,
    unanswered: 'It may still be reading the folder; try again later.',
  },
  runImport: {
    timeoutMs: 15 * MINUTE,
    unanswered:
      'It may still be working on the import; check list_designs or the app before trying again.',
  },
  checkPrint: READ,
  // Printful renders mockups in up to two minutes, after an upload and before downloads.
  createMockups: {
    timeoutMs: 5 * MINUTE,
    unanswered: 'Printful may still be making the mockups; check list_mockups before trying again.',
  },
  listMockups: READ,
  getShopOptions: READ,
  getListing: READ,
  createListing: LISTING,
  linkListing: LISTING,
  refreshListing: READ,
  listingPhotos: READ,
  replaceListingPhotos: LISTING,
  // The seller may have to prove a person is searching before Etsy shows results.
  researchKeywords: {
    timeoutMs: 5 * MINUTE,
    unanswered:
      'It may still be searching, or Etsy may be waiting for the user to prove a person is ' +
      'searching in the window the app opened. Check list_research or ask the user before ' +
      'trying again.',
  },
  listResearch: READ,
  getResearch: READ,
  listBoards: READ,
  listPins: READ,
  // Proposing a pin lays its image out first.
  proposePin: {
    timeoutMs: 2 * MINUTE,
    unanswered: 'It may still be making the pin; check list_pins before trying again.',
  },
  getBatchStatus: READ,
};

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  401: 'The app refused the connection. Restart POD Pipeline, then try again.',
  404: 'The app does not know this operation. Update the app and the MCP server.',
  413: 'The request is too large for the app. Shorten the text, or send fewer tags or translations.',
};

type Operation = keyof CatalogApi;

/**
 * The catalog API of the running desktop app, reached over its local HTTP API:
 * one call per operation, each posting its request to the operation's path.
 * The connection is looked up on every call, so restarting the app is fine.
 */
export function httpCatalogApi(
  connection: ConnectionSource,
  fetchImpl: typeof fetch = patientFetch,
): CatalogApi {
  const operations = Object.keys(OPERATIONS) as Operation[];
  const api = Object.fromEntries(
    operations.map((name) => [
      name,
      (request?: unknown) => call(connection, fetchImpl, name, request),
    ]),
  );
  // Every operation of CatalogApi is a key of OPERATIONS, and each takes its request as sent.
  return api as unknown as CatalogApi;
}

async function call(
  connection: ConnectionSource,
  fetchImpl: typeof fetch,
  name: Operation,
  request: unknown,
): Promise<unknown> {
  const { url, token } = await connection();
  const { timeoutMs, unanswered } = OPERATIONS[name];
  let response: Response;
  try {
    // The assistant cancelling a call is not passed on: the app finishes a change anyway,
    // and a read answers within seconds.
    response = await fetchImpl(`${url}${localApiPath(name)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: request === undefined ? null : JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isConnectionRefused(error)) throw new AppNotRunningError();
    // The app took the request and kept no answer for it, so it may have done the work.
    const lost =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The app did not answer in time.'
        : 'The connection to the app was lost.';
    throw failure(`${lost} ${unanswered}`, {}, 'APP_OUTCOME_UNKNOWN');
  }
  if (response.status !== 200) {
    const message = STATUS_MESSAGES[response.status] ?? `The app answered HTTP ${response.status}`;
    throw failure(message, { status: response.status });
  }
  let result: ApiResult<unknown>;
  try {
    result = (await response.json()) as ApiResult<unknown>;
  } catch {
    throw failure('The app sent an answer that could not be read.');
  }
  return unwrapResult(result);
}

/** Nothing listens on the port, so the app is closed; fetch puts the reason in `cause`. */
function isConnectionRefused(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.cause as { code?: unknown } | undefined)?.code === 'ECONNREFUSED'
  );
}

function failure(
  message: string,
  details: Record<string, unknown> = {},
  code: ApiErrorCode = 'INTERNAL',
): ApiError {
  return new ApiError({ code, message, details });
}
