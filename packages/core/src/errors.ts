export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'IMPORT_SOURCE_UNREADABLE'
  | 'IMPORT_PLAN_CHANGED'
  | 'IMPORT_NOTHING_TO_DO'
  | 'PRINT_PRODUCT_UNAVAILABLE'
  | 'PRINT_VARIANT_UNAVAILABLE'
  | 'LISTING_EXISTS'
  | 'DRAFT_UNCONFIRMED'
  | 'DRAFT_LEFT_BEHIND'
  | 'DRAFTS_NOT_CHECKED'
  | 'OTHER_BRAND_NAMED'
  | 'LISTING_NOT_SYNCED'
  | 'LISTING_NOT_LINKED'
  | 'LISTING_NOT_DRAFT'
  | 'PIN_PUBLISHING'
  | 'PIN_OUTCOME_UNKNOWN'
  | 'PIN_PHOTO_OUTDATED'
  | 'KEYWORD_FILE_UNREADABLE'
  | 'UPSCALE_FAILED'
  | 'PRINT_FILE_TOO_LARGE'
  | 'ARTWORK_TOO_SMALL_EVEN_UPSCALED';

/**
 * Base class for every error the core raises on purpose. The `code` is stable
 * and is what user interfaces translate; `message` is for logs only.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string, options?: ErrorOptions) {
    super('NOT_FOUND', `${entity} ${id} was not found`, { entity, id }, options);
  }
}

/** The print provider no longer has an uploaded print file, so the next try uploads it again. */
export class PrintFileMissingError extends NotFoundError {
  constructor(fileId: string, options?: ErrorOptions) {
    super('Print file', fileId, options);
  }
}

export class ValidationError extends DomainError {
  constructor(field: string, reason: string) {
    super('VALIDATION', `${field}: ${reason}`, { field, reason });
  }
}

/** Stored data changed underneath an operation, or would be left inconsistent by it. */
export class ConflictError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('CONFLICT', message, details);
  }
}

export class ImportSourceUnreadableError extends DomainError {
  constructor(rootPath: string, cause: unknown) {
    super(
      'IMPORT_SOURCE_UNREADABLE',
      `Cannot read import folder ${rootPath}`,
      { rootPath, cause: cause instanceof Error ? cause.message : String(cause) },
      { cause },
    );
  }
}

export class ImportPlanChangedError extends DomainError {
  constructor() {
    super(
      'IMPORT_PLAN_CHANGED',
      'The folder or the catalog changed after the preview; preview it again before importing',
    );
  }
}

export class ImportNothingToDoError extends DomainError {
  constructor() {
    super('IMPORT_NOTHING_TO_DO', 'The preview contains no new or changed designs');
  }
}

/** The design's product family has no print product to make it on yet. */
export class PrintProductUnavailableError extends DomainError {
  constructor(familyId: string) {
    super('PRINT_PRODUCT_UNAVAILABLE', `No print product is set up for ${familyId}`, {
      familyId,
    });
  }
}

/** The print provider has a variant out of stock or no longer makes it. */
export class PrintVariantUnavailableError extends DomainError {
  constructor(variantId: string) {
    super('PRINT_VARIANT_UNAVAILABLE', `Variant ${variantId} cannot be printed now`, {
      variantId,
    });
  }
}

/** A design gets one listing; it is changed on the marketplace, not made again. */
export class ListingExistsError extends DomainError {
  constructor(designId: string, marketplaceId: string) {
    super('LISTING_EXISTS', `Design ${designId} already has listing ${marketplaceId}`, {
      designId,
      marketplaceId,
    });
  }
}

/**
 * Making a draft failed halfway and removing it failed too, so it is still in
 * the shop. Trying again before deleting it would leave two.
 */
export class DraftLeftBehindError extends DomainError {
  constructor(marketplaceId: string, cause: unknown) {
    super(
      'DRAFT_LEFT_BEHIND',
      `Draft ${marketplaceId} could not be finished or removed; delete it before trying again`,
      { marketplaceId },
      { cause },
    );
  }
}

/** The seller has not checked the shop's drafts since the marketplace may have kept one of the design. */
export class DraftsNotCheckedError extends DomainError {
  constructor(details: Readonly<Record<string, unknown>>) {
    super(
      'DRAFTS_NOT_CHECKED',
      'A draft of this design may be on the marketplace; check the drafts first',
      { ...details },
    );
  }
}

/** A listing's words name a brand its product is not made for, e.g. Samsung on an iPhone case. */
export class OtherBrandNamedError extends DomainError {
  constructor(brands: readonly string[]) {
    super(
      'OTHER_BRAND_NAMED',
      `The text names ${brands.join(', ')}, which the product does not fit`,
      {
        brands,
      },
    );
  }
}

/** The print provider has not imported the listing from the shop yet. */
export class ListingNotSyncedError extends DomainError {
  constructor(marketplaceId: string) {
    super('LISTING_NOT_SYNCED', `The print provider has not imported listing ${marketplaceId}`, {
      marketplaceId,
    });
  }
}

/** Publishing before the print provider knows what to make would sell what nobody makes. */
export class ListingNotLinkedError extends DomainError {
  constructor(marketplaceId: string) {
    super('LISTING_NOT_LINKED', `Listing ${marketplaceId} is not linked to the print provider`, {
      marketplaceId,
    });
  }
}

/**
 * The listing's photos are only replaced while it is an unpublished draft, so
 * buyers never see a listing without photos; `state` is the marketplace's.
 */
export class ListingNotDraftError extends DomainError {
  constructor(marketplaceId: string, state: string) {
    super('LISTING_NOT_DRAFT', `Listing ${marketplaceId} is ${state}, not a draft`, {
      marketplaceId,
      state,
    });
  }
}

/** The pin is being published right now; it can be changed once that is done. */
export class PinPublishingError extends DomainError {
  constructor(id: string) {
    super('PIN_PUBLISHING', 'The pin is being published', { id });
  }
}

/** What the seller is told when the marketplace did not confirm a new draft. */
export const DRAFT_UNCONFIRMED_MESSAGE =
  'The marketplace did not confirm the new draft. It may have been created anyway, so look ' +
  "for it among the shop's drafts before creating it again.";

/**
 * The marketplace did not confirm a new draft: the answer broke off or was a
 * server error. It may have made the draft anyway, and the app never learnt
 * its id, so it cannot remove it.
 */
export class DraftUnconfirmedError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('DRAFT_UNCONFIRMED', DRAFT_UNCONFIRMED_MESSAGE, {}, options);
  }
}

/**
 * Why a pin is not known to have been published: the app stopped or the
 * connection broke while asking.
 */
export const PIN_OUTCOME_UNKNOWN = 'PIN_OUTCOME_UNKNOWN' satisfies ErrorCode;

/** The pin may already be published; it goes again only once the seller confirmed. */
export class PinOutcomeUnknownError extends DomainError {
  constructor(id: string) {
    super(PIN_OUTCOME_UNKNOWN, 'The pin may already be published', { id });
  }
}

/**
 * The photo a planned pin was made from may no longer be published: it is
 * gone, shows an earlier version of the artwork, or is a scene whose print is
 * not confirmed.
 */
export class PinPhotoOutdatedError extends DomainError {
  constructor(id: string, reason: string) {
    super('PIN_PHOTO_OUTDATED', `The pin's photo can no longer be published: ${reason}`, { id });
  }
}

/** A file to import keywords from is not a keyword list the app can read. */
export class KeywordFileUnreadableError extends DomainError {
  constructor(reason: 'tooLarge' | 'noKeywordColumn' | 'noKeywords') {
    super('KEYWORD_FILE_UNREADABLE', `The keyword file cannot be read: ${reason}`, { reason });
  }
}

/** The upscaler wrote something other than the image it was asked for. */
export class UpscaleFailedError extends DomainError {
  constructor(reason: string) {
    super('UPSCALE_FAILED', `Upscaling failed: ${reason}`, { reason });
  }
}

/** Even at the smallest size that prints sharp, the file is larger than the app can send. */
export class PrintFileTooLargeError extends DomainError {
  constructor(byteSize: number, maxBytes: number) {
    super('PRINT_FILE_TOO_LARGE', `The print file would be ${String(byteSize)} bytes`, {
      megabytes: Math.ceil(byteSize / 1_000_000),
      maxMegabytes: Math.floor(maxBytes / 1_000_000),
    });
  }
}

/** Made as large as upscaling makes it, the artwork still prints blurred on a listed size. */
export class ArtworkTooSmallEvenUpscaledError extends DomainError {
  constructor(asset: { readonly width: number; readonly height: number }) {
    super(
      'ARTWORK_TOO_SMALL_EVEN_UPSCALED',
      `Upscaled to ${String(asset.width)} × ${String(asset.height)}, the artwork is still too small`,
      { width: asset.width, height: asset.height },
    );
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/** The `code` an error carries, the core's or a service's own; `null` when it has none. */
export function errorCodeOf(error: unknown): string | null {
  const code: unknown =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
}
