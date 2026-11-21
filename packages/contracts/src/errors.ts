/**
 * Error codes a client may receive. Domain codes come from the application;
 * the rest describe problems at the boundary. Clients translate the code,
 * never the message.
 */
const API_ERROR_CODES = [
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'IMPORT_SOURCE_UNREADABLE',
  'IMPORT_PLAN_CHANGED',
  'IMPORT_NOTHING_TO_DO',
  'IMPORT_IN_PROGRESS',
  'IMPORT_FOLDER_NOT_APPROVED',
  'PRINT_PRODUCT_UNAVAILABLE',
  'PRINT_VARIANT_UNAVAILABLE',
  'SECRET_STORAGE_UNAVAILABLE',
  'CONNECTION_FAILED',
  'CONNECTION_IN_PROGRESS',
  'PRINTFUL_TOKEN_NOT_SINGLE_STORE',
  'PRINTFUL_STORE_NOT_ETSY',
  'PRINTFUL_STORE_OTHER_SHOP',
  'PRINTFUL_NOT_CONNECTED',
  'FILE_HOST_NOT_CONNECTED',
  'PROVIDER_FAILED',
  'PROVIDER_BUSY',
  'PROVIDER_INTERRUPTED',
  'MOCKUPS_IN_PROGRESS',
  'LISTING_EXISTS',
  'DRAFT_UNCONFIRMED',
  'DRAFT_LEFT_BEHIND',
  'SHOP_CURRENCY_CHANGED',
  'LISTING_NOT_SYNCED',
  'LISTING_NOT_LINKED',
  'LISTING_NOT_DRAFT',
  'ETSY_NOT_CONNECTED',
  'LISTING_IN_PROGRESS',
  'AI_NOT_CONNECTED',
  'PINTEREST_NOT_CONNECTED',
  'PIN_IN_PROGRESS',
  'PIN_OUTCOME_UNKNOWN',
  'PIN_PHOTO_OUTDATED',
  'PIN_PUBLISHING',
  'SCENE_IN_PROGRESS',
  'REFERENCE_IMAGE_UNREADABLE',
  'RESEARCH_IN_PROGRESS',
  'RESEARCH_RATE_LIMITED',
  'RESEARCH_BLOCKED',
  'RESEARCH_CANCELLED',
  'RESEARCH_PAGE_CHANGED',
  'KEYWORD_FILE_UNREADABLE',
  'BATCH_IN_PROGRESS',
  'LISTING_PRICE_MISSING',
  'PRINT_QUALITY_POOR',
  'TRANSLATION_INCOMPLETE',
  'SHOP_SETUP_MISSING',
  'BATCH_DESIGN_CHANGED',
  'DRAFTS_NOT_CHECKED',
  'SHIPPING_PROFILE_GONE',
  'OTHER_BRAND_NAMED',
  'UPSCALER_UNAVAILABLE',
  'UPSCALE_IN_PROGRESS',
  'UPSCALE_FAILED',
  'ROTATE_IN_PROGRESS',
  'PRINT_FILE_TOO_LARGE',
  'ARTWORK_TOO_SMALL_EVEN_UPSCALED',
  'APP_CLOSING',
  /** Raised by clients when the app took a request but its answer never came. */
  'APP_OUTCOME_UNKNOWN',
  'INVALID_REQUEST',
  'INTERNAL',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Errors after which Etsy may hold a draft the app does not know of, so the
 * seller checks the shop's drafts before one is created again.
 */
export const DRAFT_MAY_EXIST_CODES = [
  'DRAFT_UNCONFIRMED',
  'DRAFT_LEFT_BEHIND',
  'DRAFTS_NOT_CHECKED',
] as const satisfies readonly ApiErrorCode[];

export interface ApiErrorPayload {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiErrorPayload };

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.details = payload.details;
  }
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** Converts a transported result back into a value or a thrown {@link ApiError}. */
export function unwrapResult<T>(result: ApiResult<T>): T {
  if (result.ok) return result.value;
  throw new ApiError(result.error);
}
