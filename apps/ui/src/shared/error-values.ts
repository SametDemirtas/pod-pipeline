import {
  MAX_KEYWORD_FILE_BYTES,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGE_SIDE,
} from '@pod/contracts/client';
import { DEFAULT_BUSY_WAIT_SECONDS } from '@pod/rules';
import { formatBytes, formatList, formatWait } from './format.js';

/**
 * What error messages name: limits taken from the code, so the texts cannot
 * drift from it, and what the error itself tells, e.g. which draft was left.
 */
export function errorValues(locale: string, details: Readonly<Record<string, unknown>> = {}) {
  const {
    marketplaceId,
    currency,
    retryAfterSeconds,
    service,
    effectiveDpi,
    languages,
    brands,
    store,
    shop,
  } = details;
  const list = (values: unknown) =>
    Array.isArray(values) ? formatList(values.map(String), locale) : '';
  return {
    size: formatBytes(MAX_KEYWORD_FILE_BYTES, locale),
    referenceSize: formatBytes(MAX_REFERENCE_IMAGE_BYTES, locale),
    referenceSide: MAX_REFERENCE_IMAGE_SIDE,
    marketplaceId: typeof marketplaceId === 'string' ? marketplaceId : '',
    currency: typeof currency === 'string' ? currency : '',
    wait: formatWait(
      typeof retryAfterSeconds === 'number' ? retryAfterSeconds : DEFAULT_BUSY_WAIT_SECONDS,
      locale,
    ),
    service: typeof service === 'string' ? service : '',
    dpi: typeof effectiveDpi === 'number' ? effectiveDpi : 0,
    languages: list(languages),
    brands: list(brands),
    store: typeof store === 'string' ? store : '',
    shop: typeof shop === 'string' ? shop : '',
  };
}
