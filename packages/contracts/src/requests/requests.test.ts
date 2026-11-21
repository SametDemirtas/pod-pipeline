import { describe, expect, it } from 'vitest';
import {
  MAX_CURSOR_LENGTH,
  MAX_DESIGN_ID_LENGTH,
  MAX_FAMILY_ID_LENGTH,
  MAX_FINGERPRINT_LENGTH,
  MAX_PATH_LENGTH,
} from '../field-limits.js';
import { MAX_PAGE_SIZE } from '../limits.js';
import {
  connectSignInRequest,
  cancelSignInRequest,
  connectPrintfulRequest,
  connectS3Request,
  createListingRequest,
  designIdRequest,
  listDesignsRequest,
  previewImportRequest,
  removeImportFolderRequest,
  runImportRequest,
  translateListingTextRequest,
  updateSettingsRequest,
  writeListingTextRequest,
} from './index.js';

describe('request schemas', () => {
  const longer = (limit: number) => 'x'.repeat(limit + 1);

  it('lets only Cloudflare R2 leave the region at auto', () => {
    const keys = { bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' };
    const r2 = connectS3Request.safeParse({
      ...keys,
      endpoint: 'https://a1.r2.cloudflarestorage.com',
    });
    const s3 = { ...keys, endpoint: 'https://s3.us-east-1.amazonaws.com' };

    expect(r2.success && r2.data.region).toBe('auto');
    expect(connectS3Request.safeParse(s3).success).toBe(false);
    expect(connectS3Request.safeParse({ ...s3, region: 'us-east-1' }).success).toBe(true);
    expect(
      connectS3Request.parse({ ...s3, endpoint: ` ${s3.endpoint} `, region: ' us-east-1 ' }),
    ).toMatchObject({ endpoint: s3.endpoint, region: 'us-east-1' });
    expect(connectS3Request.safeParse({ ...s3, endpoint: 'http://x.example' }).success).toBe(false);
  });

  it('limit listing requests to numeric shop ids and a bounded list of size prices', () => {
    const listing = {
      designId: 'd',
      fit: 'contain',
      language: 'en-US',
      title: 'T',
      description: 'D',
      tags: [],
      price: 1999,
      sizePrices: { '2XL': 2199 },
      currency: 'USD',
      variantIds: ['1'],
      mockupIds: ['m'],
      shippingProfileId: '316',
      readinessStateId: '151',
      productionPartnerIds: [],
    };
    const manySizes = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`S${i}`, 100]));

    expect(createListingRequest.safeParse(listing).success).toBe(true);
    expect(createListingRequest.safeParse({ ...listing, sizePrices: manySizes }).success).toBe(
      false,
    );
    expect(createListingRequest.safeParse({ ...listing, shippingProfileId: 'x1' }).success).toBe(
      false,
    );
    for (const refused of [
      { price: 0 },
      { price: 19.99 },
      { sizePrices: { '2XL': -1 } },
      { language: 'english please' },
      { translations: Array.from({ length: 11 }, () => ({ ...words, language: 'de' })) },
    ]) {
      expect(createListingRequest.safeParse({ ...listing, ...refused }).success).toBe(false);
    }
  });

  const words = { title: 'T', description: 'D', tags: [] };

  it('hold the writer and translator to the limits the app applies', () => {
    const write = { designId: 'd', language: 'de' };
    const keywords = (count: number) => Array.from({ length: count }, () => ({ term: 'mug' }));
    const languages = (count: number) => Array.from({ length: count }, () => 'fr');

    expect(writeListingTextRequest.safeParse({ ...write, keywords: keywords(20) }).success).toBe(
      true,
    );
    expect(writeListingTextRequest.safeParse({ ...write, keywords: keywords(21) }).success).toBe(
      false,
    );
    expect(writeListingTextRequest.safeParse({ ...write, notes: '語'.repeat(1000) }).success).toBe(
      true,
    );
    expect(writeListingTextRequest.safeParse({ ...write, notes: 'x'.repeat(1001) }).success).toBe(
      false,
    );
    const blanks = Array.from({ length: 5 }, () => ({ term: '  ' }));
    expect(
      writeListingTextRequest.safeParse({ ...write, keywords: [...keywords(20), ...blanks] })
        .success,
    ).toBe(true);
    expect(
      writeListingTextRequest.safeParse({ ...write, notes: ` ${'x'.repeat(1000)}\n` }).success,
    ).toBe(true);
    expect(
      translateListingTextRequest.safeParse({ ...words, languages: languages(10) }).success,
    ).toBe(true);
    expect(
      translateListingTextRequest.safeParse({ ...words, languages: languages(11) }).success,
    ).toBe(false);
  });

  it('take the product a translation is for, but not an empty one', () => {
    const request = { ...words, languages: ['de'] };

    expect(translateListingTextRequest.safeParse({ ...request, familyId: 'mug' }).success).toBe(
      true,
    );
    expect(translateListingTextRequest.safeParse({ ...request, familyId: '' }).success).toBe(false);
  });

  it('trim pasted keys and app ids, since the window sends them as typed', () => {
    expect(connectPrintfulRequest.parse({ token: ' secret ' })).toEqual({ token: 'secret' });
    expect(
      connectSignInRequest.parse({ service: 'pinterest', appId: ' 1500 ', appSecret: ' s ' }),
    ).toEqual({ service: 'pinterest', appId: '1500', appSecret: 's' });
    expect(connectPrintfulRequest.safeParse({ token: '   ' }).success).toBe(false);
  });

  it('take only the app fields of the service signed in to', () => {
    expect(
      connectSignInRequest.safeParse({ service: 'etsy', keystring: 'k', sharedSecret: 's' })
        .success,
    ).toBe(true);
    expect(
      connectSignInRequest.safeParse({ service: 'etsy', appId: '1500', appSecret: 's' }).success,
    ).toBe(false);
    expect(
      connectSignInRequest.safeParse({ service: 'pinterest', appId: 'app', appSecret: 's' })
        .success,
    ).toBe(false);
    expect(cancelSignInRequest.safeParse({ service: 'pinterest' }).success).toBe(true);
    expect(cancelSignInRequest.safeParse({ service: 'printful' }).success).toBe(false);
  });

  it('count search length in characters, after trimming', () => {
    expect(listDesignsRequest.safeParse({ search: '🎄'.repeat(100) }).success).toBe(true);
    expect(listDesignsRequest.safeParse({ search: '🎄'.repeat(101) }).success).toBe(false);
    expect(listDesignsRequest.parse({ search: `  ${'x'.repeat(100)}  ` })).toEqual({
      search: 'x'.repeat(100),
    });
  });

  it('accept well-formed requests', () => {
    expect(listDesignsRequest.parse({})).toEqual({});
    expect(
      listDesignsRequest.parse({ familyId: 'mug', search: 'tulip', limit: 24, cursor: 'abc' }),
    ).toEqual({ familyId: 'mug', search: 'tulip', limit: 24, cursor: 'abc' });
    expect(listDesignsRequest.parse({ limit: 1 }).limit).toBe(1);
    expect(listDesignsRequest.parse({ limit: MAX_PAGE_SIZE }).limit).toBe(MAX_PAGE_SIZE);
    expect(designIdRequest.parse({ id: 'd-1' })).toEqual({ id: 'd-1' });
    expect(previewImportRequest.parse({ rootPath: 'C:\\Designs' })).toEqual({
      rootPath: 'C:\\Designs',
    });
    expect(runImportRequest.parse({ rootPath: '/d', fingerprint: 'f' })).toEqual({
      rootPath: '/d',
      fingerprint: 'f',
    });
    expect(removeImportFolderRequest.parse({ folder: '/d' })).toEqual({ folder: '/d' });
    expect(updateSettingsRequest.parse({ language: 'de' })).toEqual({ language: 'de' });
  });

  it.each([
    ['listDesigns', listDesignsRequest, {}],
    ['designId', designIdRequest, { id: 'd' }],
    ['previewImport', previewImportRequest, { rootPath: '/d' }],
    ['runImport', runImportRequest, { rootPath: '/d', fingerprint: 'f' }],
    ['removeImportFolder', removeImportFolderRequest, { folder: '/d' }],
    ['updateSettings', updateSettingsRequest, {}],
  ] as const)('%s refuses unknown keys', (_name, schema, valid) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, unexpected: true }).success).toBe(false);
  });

  it.each([
    [listDesignsRequest, { familyId: longer(MAX_FAMILY_ID_LENGTH) }],
    [listDesignsRequest, { cursor: longer(MAX_CURSOR_LENGTH) }],
    [designIdRequest, { id: longer(MAX_DESIGN_ID_LENGTH) }],
    [previewImportRequest, { rootPath: longer(MAX_PATH_LENGTH) }],
    [runImportRequest, { rootPath: longer(MAX_PATH_LENGTH), fingerprint: 'f' }],
    [runImportRequest, { rootPath: '/d', fingerprint: longer(MAX_FINGERPRINT_LENGTH) }],
    [removeImportFolderRequest, { folder: longer(MAX_PATH_LENGTH) }],
  ])('refuses an over-long value %#', (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it.each([
    [listDesignsRequest, { limit: '5' }],
    [listDesignsRequest, { limit: 1.5 }],
    [listDesignsRequest, { limit: 0 }],
    [listDesignsRequest, { limit: MAX_PAGE_SIZE + 1 }],
    [listDesignsRequest, { familyId: '' }],
    [listDesignsRequest, { cursor: '' }],
    [designIdRequest, {}],
    [designIdRequest, { id: '' }],
    [previewImportRequest, { rootPath: '' }],
    [previewImportRequest, null],
    [runImportRequest, { rootPath: '/d' }],
    [removeImportFolderRequest, { folder: '' }],
    [updateSettingsRequest, { language: 'fr' }],
  ])('refuses malformed input %#', (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
