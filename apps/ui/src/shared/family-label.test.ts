import { describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n.js';
import { familyLabel } from './family-label.js';

describe('familyLabel', () => {
  it('translates known families and shows others by their id', async () => {
    const { t } = await createI18n('de');

    expect(familyLabel(t, 'phone-case')).toBe('iPhone-Hülle');
    expect(familyLabel(t, 'samsung-case')).toBe('Samsung-Hülle');
    expect(familyLabel(t, 'lamp')).toBe('lamp');
  });
});
