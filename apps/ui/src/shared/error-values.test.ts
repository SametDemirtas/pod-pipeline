import { describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n.js';
import { errorValues } from './error-values.js';

describe('errorValues', () => {
  it('names the wait a busy service asked for, or a minute when it did not say', async () => {
    const { t } = await createI18n('en');
    const busy = (details: Record<string, unknown>) =>
      t('errors.PROVIDER_BUSY', errorValues('en', { service: 'Claude', ...details }));

    expect(busy({ retryAfterSeconds: 30 })).toBe(
      'Claude is busy and turned the request away for now. Try again in 30 seconds.',
    );
    expect(busy({})).toMatch(/Try again in 1 minute\.$/);
  });

  it.each([
    ['tr', /30 saniye sonra tekrar dene\.$/],
    ['de', /Versuche es in 30 Sekunden erneut\.$/],
  ] as const)('names the wait in %s', async (language, text) => {
    const { t } = await createI18n(language);

    expect(
      t(
        'errors.PROVIDER_BUSY',
        errorValues(language, { service: 'Claude', retryAfterSeconds: 30 }),
      ),
    ).toMatch(text);
  });

  it.each(['en', 'tr', 'de'] as const)(
    'names the Printful store and the Etsy shop when the token is for the wrong store in %s',
    async (language) => {
      const { t } = await createI18n(language);
      const details = { store: 'Maple Lane', shop: 'MapleLaneStore' };

      for (const code of ['PRINTFUL_STORE_NOT_ETSY', 'PRINTFUL_STORE_OTHER_SHOP'] as const) {
        const text = t(`errors.${code}`, errorValues(language, details));
        expect(text).toContain('Maple Lane');
        expect(text).toContain('MapleLaneStore');
      }
    },
  );
});
