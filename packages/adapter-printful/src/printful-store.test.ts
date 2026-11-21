import { describe, expect, it } from 'vitest';
import { readPrintfulStore } from './printful-store.js';

describe('readPrintfulStore', () => {
  it('tells whether the store syncs with Etsy, and when Printful did not say', () => {
    expect(readPrintfulStore({ name: 'Maple Lane', type: 'Etsy' }).syncsWithMarketplace).toBe(true);
    expect(readPrintfulStore({ name: 'Maple Lane', type: 'native' }).syncsWithMarketplace).toBe(
      false,
    );
    expect(readPrintfulStore({ name: 'Maple Lane' }).syncsWithMarketplace).toBeNull();
  });

  it('reads the shop from an Etsy shop page or its own Etsy address', () => {
    const handle = (website: string) => readPrintfulStore({ website }).shopHandle;

    expect(handle('https://www.etsy.com/de/shop/MapleLaneStore?ref=x')).toBe('MapleLaneStore');
    expect(handle('https://www.etsy.com/shop/Maple%20Lane')).toBe('Maple Lane');
    expect(handle('https://www.etsy.com/shop/100%')).toBe('100%');
    expect(handle('maplelanestore.etsy.com')).toBe('maplelanestore');
    expect(handle('https://www.etsy.com')).toBeNull();
    expect(handle('https://maplelane.example')).toBeNull();
  });

  it('names a store without a name after Printful', () => {
    expect(readPrintfulStore(null)).toEqual({
      name: 'Printful',
      syncsWithMarketplace: null,
      shopHandle: null,
    });
  });
});
