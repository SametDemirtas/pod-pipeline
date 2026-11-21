import { describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n.js';
import { areaLabel, sizeLabel, viewLabel } from './print-labels.js';

describe('size labels', () => {
  it('call a size what the product calls it', async () => {
    const { t } = await createI18n('tr');

    expect(sizeLabel(t, 'hoodie')).toBe('Beden');
    expect(sizeLabel(t, 'phone-case')).toBe('Model');
    expect(sizeLabel(t, 'samsung-case')).toBe('Model');
    expect(sizeLabel(t, 'poster')).toBe('Boyut');
  });
});

describe('Printful labels', () => {
  it('tidies print area names it does not translate', () => {
    const t = ((key: string) => `t:${key}`) as unknown as Parameters<typeof areaLabel>[0];

    expect(areaLabel(t, 'front')).toBe('t:print.areas.front');
    expect(areaLabel(t, 'label_inside')).toBe('Label inside');
  });

  it('names the main view after the front, and tidies views it does not translate', () => {
    const t = ((key: string) => `t:${key}`) as unknown as Parameters<typeof viewLabel>[0];

    expect(viewLabel(t, 'default')).toBe('t:mockups.views.front');
    expect(viewLabel(t, 'Left')).toBe('t:mockups.views.left');
    expect(viewLabel(t, 'flat_lay')).toBe('Flat lay');
  });
});
