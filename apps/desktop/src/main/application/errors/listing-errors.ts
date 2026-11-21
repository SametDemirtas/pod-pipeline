import type { FulfilmentStoreProblem } from '@pod/contracts';
import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

/**
 * The answer to creating a draft broke off or failed on Etsy's side, so Etsy
 * may have made the draft anyway.
 * Trying again at once could leave two drafts.
 */
export class DraftMayExistError extends AppError {
  constructor() {
    super('DRAFT_UNCONFIRMED', 'Etsy did not confirm the new draft; it may exist anyway');
  }
}

/** The shop's currency changed after the prices were entered, so they are entered again. */
export class ShopCurrencyChangedError extends AppError {
  constructor(currency: string) {
    super(
      'SHOP_CURRENCY_CHANGED',
      `The shop's currency is now ${currency}; enter the prices again`,
      { currency },
    );
  }
}

export class ListingInProgressError extends InProgressError {
  constructor() {
    super('LISTING_IN_PROGRESS', 'The previous listing change is still running');
  }
}

/**
 * Printful has not imported a listing, and its store cannot: the token belongs
 * to a store that syncs with no Etsy shop, or with another one than the app's.
 */
export class PrintfulWrongStoreError extends AppError {
  constructor(problem: FulfilmentStoreProblem, store: string, shop: string) {
    super(
      problem === 'not-marketplace' ? 'PRINTFUL_STORE_NOT_ETSY' : 'PRINTFUL_STORE_OTHER_SHOP',
      problem === 'not-marketplace'
        ? `The Printful store ${store} is not connected to an Etsy shop`
        : `The Printful store ${store} does not look like the one of the Etsy shop ${shop}`,
      { store, shop },
    );
  }
}
