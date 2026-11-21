import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

/** Listings are being prepared already; one job runs at a time. */
export class BatchInProgressError extends InProgressError {
  constructor() {
    super('BATCH_IN_PROGRESS', 'Listings are still being prepared');
  }
}

/** Prepared listings take their price from the settings, and the family has none. */
export class ListingPriceMissingError extends AppError {
  constructor(familyId: string, sizes: readonly string[] = []) {
    super('LISTING_PRICE_MISSING', `Set a price for ${familyId} in the settings`, {
      familyId,
      sizes,
    });
  }
}

/** The design would print blurred, so no listing is prepared for it. */
export class PrintQualityPoorError extends AppError {
  constructor(effectiveDpi: number, size: string | null) {
    super('PRINT_QUALITY_POOR', `The design prints at only ${String(effectiveDpi)} DPI`, {
      effectiveDpi,
      size,
    });
  }
}

/** Some of the shop's languages could not be translated; the others are kept. */
export class TranslationIncompleteError extends AppError {
  constructor(languages: readonly string[]) {
    super('TRANSLATION_INCOMPLETE', `Not translated into ${languages.join(', ')}`, {
      languages,
    });
  }
}

/** The Etsy shop has no shipping profile or no processing time a draft could use. */
export class ShopSetupMissingError extends AppError {
  constructor() {
    super('SHOP_SETUP_MISSING', 'The Etsy shop needs a shipping profile and a processing time');
  }
}

/** The design was imported again during the run, so what was prepared no longer fits it. */
export class BatchDesignChangedError extends AppError {
  constructor(designKey: string) {
    super('BATCH_DESIGN_CHANGED', `${designKey} changed during the run; start a new run`, {
      designKey,
    });
  }
}

/** The shipping profile chosen for the family in the settings is no longer in the Etsy shop. */
export class ShippingProfileGoneError extends AppError {
  constructor(familyId: string) {
    super(
      'SHIPPING_PROFILE_GONE',
      `The shipping profile chosen for ${familyId} is no longer in the Etsy shop`,
      { familyId },
    );
  }
}
