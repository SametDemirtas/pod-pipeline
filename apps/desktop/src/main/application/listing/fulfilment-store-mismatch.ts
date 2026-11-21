import type { FulfilmentStoreProblem } from '@pod/contracts';

/** Why the fulfilment store cannot take the marketplace shop's listings, with the names to show. */
export interface FulfilmentStoreMismatch {
  readonly problem: FulfilmentStoreProblem;
  readonly storeName: string;
  readonly shopName: string;
}
