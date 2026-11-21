import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@pod/contracts';
import { byName } from '../testing/operation-by-name.js';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { catalogOperations } from './operations.js';
import {
  AI_CATALOG,
  makeDesktopOperations,
  fakeConnections,
  fakeKeywords,
} from '../testing/desktop-operation-fakes.js';

describe('operations', () => {
  it('cover every desktop channel once, and the catalog subset for local tools', () => {
    const catalog = fakeCatalog();
    const desktop = makeDesktopOperations({ catalog });

    expect(desktop.map((operation) => operation.name).sort()).toEqual(
      Object.keys(IPC_CHANNELS).sort(),
    );
    expect(catalogOperations(catalog).map((operation) => operation.name)).toEqual([
      'listFamilies',
      'listDesigns',
      'getDesign',
      'previewImport',
      'runImport',
      'listImportFolders',
      'checkPrint',
      'createMockups',
      'listMockups',
      'getShopOptions',
      'getListing',
      'createListing',
      'linkListing',
      'refreshListing',
      'listingPhotos',
      'replaceListingPhotos',
      'researchKeywords',
      'listResearch',
      'getResearch',
      'listBoards',
      'listPins',
      'proposePin',
      'getBatchStatus',
    ]);
  });

  it('validate input before calling the catalog', async () => {
    const catalog = fakeCatalog();
    const operations = catalogOperations(catalog);

    await expect(byName(operations, 'listDesigns').handle({ limit: 5 })).resolves.toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
    expect(catalog.listDesigns).toHaveBeenCalledWith({ limit: 5 });
    await expect(byName(operations, 'previewImport').handle({ rootPath: '/d' })).rejects.toThrow(
      'unexpected call',
    );
    expect(catalog.previewImport).toHaveBeenCalledWith({ rootPath: '/d' });
    await expect(byName(operations, 'previewImport').handle({ rootPath: '' })).rejects.toThrow();
    await expect(byName(operations, 'runImport').handle({ rootPath: '/d' })).rejects.toThrow();
    await expect(byName(operations, 'getDesign').handle({})).rejects.toThrow();
    expect(catalog.runImport).not.toHaveBeenCalled();
    expect(catalog.getDesign).not.toHaveBeenCalled();
  });

  it('validate print requests before calling the catalog', async () => {
    const catalog = fakeCatalog();
    const operations = catalogOperations(catalog);

    await expect(
      byName(operations, 'checkPrint').handle({ designId: 'd', fit: 'contain' }),
    ).rejects.toThrow('unexpected call');
    await expect(
      byName(operations, 'createMockups').handle({ designId: 'd', variantId: '1', fit: 'cover' }),
    ).rejects.toThrow('unexpected call');
    expect(await byName(operations, 'listMockups').handle({ id: 'd' })).toEqual([]);
    await expect(
      byName(operations, 'checkPrint').handle({ designId: 'd', fit: 'stretch' }),
    ).rejects.toThrow();
    expect(catalog.checkPrint).toHaveBeenCalledTimes(1);
    expect(catalog.createMockups).toHaveBeenCalledWith({
      designId: 'd',
      variantId: '1',
      fit: 'cover',
    });
  });

  it('serve settings and the folder picker to the window', async () => {
    const operations = makeDesktopOperations({
      folders: {
        choose: () => Promise.resolve('/chosen'),
        remove: (folder: string) => Promise.resolve([folder]),
      },
    });

    expect(await byName(operations, 'pickFolder').handle(undefined)).toBe('/chosen');
    expect(await byName(operations, 'getMcpLaunch').handle(undefined)).toEqual({
      command: 'app',
      args: ['--mcp-server'],
      env: {},
      outsideApplicationsFolder: false,
    });
    expect(await byName(operations, 'updateSettings').handle({ language: 'tr' })).toMatchObject({
      language: 'tr',
    });
    expect(await byName(operations, 'getSettings').handle(undefined)).toMatchObject({
      language: 'tr',
    });
    expect(await byName(operations, 'getAiCatalog').handle(undefined)).toBe(AI_CATALOG);
    await expect(
      byName(operations, 'updateSettings').handle({ textProvider: 'mistral' }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'updateSettings').handle({ sceneProvider: 'deepseek' }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'updateSettings').handle({ textModel: 'GPT 6/../x' }),
    ).rejects.toThrow();
    expect(await byName(operations, 'removeImportFolder').handle({ folder: '/d' })).toEqual(['/d']);
    await expect(byName(operations, 'removeImportFolder').handle({})).rejects.toThrow();
    await expect(byName(operations, 'updateSettings').handle({ language: 'fr' })).rejects.toThrow();
  });

  it('serve keyword lists to the window', async () => {
    const keywords = fakeKeywords();
    const operations = makeDesktopOperations({ keywords });

    expect(await byName(operations, 'importKeywordList').handle({ market: 'DE' })).toBeNull();
    expect(keywords.importKeywordList).toHaveBeenCalledWith({ market: 'DE' });
    await expect(
      byName(operations, 'importKeywordList').handle({ market: 'FR' }),
    ).rejects.toThrow();
    expect(await byName(operations, 'removeKeywordList').handle({ id: 'k1' })).toEqual([]);
    expect(keywords.removeKeywordList).toHaveBeenCalledWith({ id: 'k1' });
    expect(await byName(operations, 'listKeywordLists').handle(undefined)).toEqual([]);
    await expect(byName(operations, 'getKeywordList').handle({ id: 'k1' })).rejects.toThrow(
      'no list k1',
    );
    await expect(byName(operations, 'getKeywordList').handle({})).rejects.toThrow();
    expect(keywords.getKeywordList).toHaveBeenCalledTimes(1);
  });

  it('pass the research market on, and refuse one it does not know', async () => {
    const catalog = fakeCatalog();
    const operations = catalogOperations(catalog);

    await expect(
      byName(operations, 'researchKeywords').handle({ query: 'tasse', market: 'DE' }),
    ).rejects.toThrow('unexpected call');
    expect(catalog.researchKeywords).toHaveBeenCalledWith({ query: 'tasse', market: 'DE' });
    await expect(
      byName(operations, 'researchKeywords').handle({ query: 'tasse', market: 'FR' }),
    ).rejects.toThrow();
  });
});

describe('connection operations', () => {
  it('validate credentials before connecting', async () => {
    const connections = fakeConnections();
    const operations = makeDesktopOperations({ connections });

    await byName(operations, 'getConnections').handle(undefined);
    await byName(operations, 'connectPrintful').handle({ token: ' pf ' });
    await byName(operations, 'startDropbox').handle({ appKey: 'key' });
    await byName(operations, 'finishDropbox').handle({ code: 'code' });
    await byName(operations, 'connectS3').handle({
      endpoint: 'https://a.r2.cloudflarestorage.com',
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
    });
    await byName(operations, 'connectSignIn').handle({
      service: 'etsy',
      keystring: ' key ',
      sharedSecret: 's',
    });
    await byName(operations, 'disconnect').handle({ service: 'printful' });

    expect(connections.get).toHaveBeenCalled();
    expect(connections.connectPrintful).toHaveBeenCalledWith({ token: 'pf' });
    expect(connections.startDropbox).toHaveBeenCalledWith({ appKey: 'key' });
    expect(connections.finishDropbox).toHaveBeenCalledWith({ code: 'code' });
    expect(connections.connectS3).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'auto', bucket: 'b' }),
    );
    expect(connections.connectSignIn).toHaveBeenCalledWith({
      service: 'etsy',
      keystring: 'key',
      sharedSecret: 's',
    });
    await byName(operations, 'cancelSignIn').handle({ service: 'etsy' });
    await byName(operations, 'connectAi').handle({ provider: 'kimi', apiKey: ' sk ' });
    expect(connections.connectAi).toHaveBeenCalledWith({ provider: 'kimi', apiKey: 'sk' });
    await expect(
      byName(operations, 'connectAi').handle({ provider: 'moonshot-cn', apiKey: 'sk' }),
    ).rejects.toThrow();
    expect(connections.cancelSignIn).toHaveBeenCalledWith({ service: 'etsy' });
    await byName(operations, 'connectSignIn').handle({
      service: 'pinterest',
      appId: '1500',
      appSecret: ' s ',
    });
    expect(connections.connectSignIn).toHaveBeenCalledWith({
      service: 'pinterest',
      appId: '1500',
      appSecret: 's',
    });
    await expect(
      byName(operations, 'connectSignIn').handle({
        service: 'pinterest',
        appId: 'app',
        appSecret: 's',
      }),
    ).rejects.toThrow();
    await expect(byName(operations, 'cancelSignIn').handle(undefined)).rejects.toThrow();
    expect(connections.disconnect).toHaveBeenCalledWith({ service: 'printful' });
    await expect(byName(operations, 'connectPrintful').handle({ token: ' ' })).rejects.toThrow();
    await expect(
      byName(operations, 'connectS3').handle({
        endpoint: 'http://insecure.example',
        bucket: 'b',
        accessKeyId: 'k',
        secretAccessKey: 's',
      }),
    ).rejects.toThrow();
    await expect(byName(operations, 'disconnect').handle({ service: 'shop' })).rejects.toThrow();
    await expect(
      byName(operations, 'connectSignIn').handle({
        service: 'etsy',
        keystring: 'key',
        sharedSecret: '',
      }),
    ).rejects.toThrow();
  });
});

describe('print operations', () => {
  it('give the window the sizes of a family and refuse a request without one', async () => {
    const operations = makeDesktopOperations();

    await expect(
      byName(operations, 'listFamilySizes').handle({ familyId: 'blanket' }),
    ).resolves.toEqual(['50″×60″', '60″×80″']);
    await expect(byName(operations, 'listFamilySizes').handle({})).rejects.toThrow();
    expect(catalogOperations(fakeCatalog()).map((operation) => operation.name)).not.toContain(
      'listFamilySizes',
    );
  });

  it('let only the window make artwork larger', async () => {
    const operations = makeDesktopOperations();

    await expect(
      byName(operations, 'upscaleDesign').handle({ id: 'id-01-blanket' }),
    ).resolves.toMatchObject({
      designKey: '01-blanket',
    });
    await expect(byName(operations, 'upscaleDesign').handle({})).rejects.toThrow();
    expect(catalogOperations(fakeCatalog()).map((operation) => operation.name)).not.toContain(
      'upscaleDesign',
    );
  });
});
