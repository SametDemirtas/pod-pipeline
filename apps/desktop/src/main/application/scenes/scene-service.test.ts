import { describe, expect, it } from 'vitest';
import { type MockupId } from '@pod/core';
import { AiNotConnectedError } from '../errors/connection-errors.js';
import {
  ProviderBusyError,
  ProviderFailedError,
  ProviderInterruptedError,
  ProviderUnavailableError,
} from '../errors/provider-errors.js';
import {
  MUG,
  SHIRT,
  PLAIN,
  holdNextScene,
  onlyScene,
  sceneRequest,
  setUp,
} from '../../testing/scene-service-setup.js';
import { photo } from '../../testing/mockup-fixtures.js';

describe('SceneService', () => {
  it('makes a checked scene, confirms its print, then removes a photo, announcing each', async () => {
    const { service, photos, catalogChanged } = await setUp();

    const scene = await onlyScene(service.createScene(sceneRequest('table')));
    const confirmed = await service.confirmScenePrint({
      designId: MUG,
      mockupId: scene.id,
      confirmed: true,
    });
    const left = await photos.removeMockup({ designId: MUG, mockupId: 'm1' });

    expect(scene).toMatchObject({
      id: 'scene-0001',
      scenePrompt: 'table',
      view: 'Scene',
      sceneCheck: { same: true, issues: [], unverifiable: [] },
      printConfirmed: false,
    });
    expect(confirmed.printConfirmed).toBe(true);
    expect(left.map((mockup) => [mockup.id, mockup.printConfirmed])).toEqual([
      ['scene-0001', true],
    ]);
    expect(catalogChanged).toHaveBeenCalledTimes(3);
  });

  it('keeps a scene unchecked when Claude is not connected, fails or cannot be reached, without logging it', async () => {
    const { service, inspector, catalogChanged, logError } = await setUp();
    const mirrored = { same: false, issues: ['3: mirrored'], unverifiable: [] };
    inspector.failWith = new AiNotConnectedError('Claude');
    const unchecked = await onlyScene(service.createScene(sceneRequest('table')));
    inspector.failWith = new ProviderFailedError('Claude', 'overloaded');
    const failed = await onlyScene(service.createScene(sceneRequest('beach')));
    inspector.failWith = new ProviderUnavailableError('Claude');
    await service.createScene(sceneRequest('offline'));
    inspector.failWith = new ProviderInterruptedError('Claude', 'timed out');
    await service.createScene(sceneRequest('timeout'));
    inspector.failWith = undefined;
    inspector.answer = mirrored;

    const checked = await service.checkSceneAgain({ designId: MUG, mockupId: unchecked.id });

    expect([unchecked.sceneCheck, failed.sceneCheck]).toEqual([null, null]);
    expect(unchecked.canCheckAgain).toBe(true);
    expect(checked.sceneCheck).toEqual(mirrored);
    expect(catalogChanged).toHaveBeenCalledTimes(5);
    expect(logError).not.toHaveBeenCalled();
  });

  it('keeps a scene unchecked and logs a check that broke for another reason', async () => {
    const { service, inspector, mockups, catalogChanged, logError } = await setUp();
    const broken = new Error('thumbnail cache is broken');
    inspector.failWith = broken;

    const scene = await onlyScene(service.createScene(sceneRequest('table')));

    expect(scene.sceneCheck).toBeNull();
    expect((await mockups.listForDesign(MUG)).map((mockup) => mockup.view)).toEqual([
      'Scene',
      'Front',
    ]);
    expect(logError).toHaveBeenCalledWith(broken);
    expect(catalogChanged).toHaveBeenCalledTimes(1);
    await expect(service.checkSceneAgain({ designId: MUG, mockupId: scene.id })).rejects.toThrow(
      'thumbnail cache is broken',
    );
  });

  it('reads the product once, before the first scene of its photo, for Gemini to keep', async () => {
    const { service, generator, products } = await setUp();
    const request = sceneRequest('table');

    await service.createScene(request);
    await service.createScene(request);

    expect(products.requests.map((asked) => asked.productType)).toEqual(['mug']);
    expect(generator.requests.map((asked) => asked.prompt)).toEqual([
      expect.stringContaining('Product details, read from the photo:') as string,
      expect.stringContaining('Product details, read from the photo:') as string,
    ]);
  });

  it('makes scenes without product details when the reader is not connected, without logging', async () => {
    const { service, generator, products, logError } = await setUp();
    products.failWith = new AiNotConnectedError('Claude');

    await onlyScene(service.createScene(sceneRequest('table')));

    expect(generator.requests[0]?.prompt).not.toContain('Product details');
    expect(logError).not.toHaveBeenCalled();
  });

  it('makes scenes without product details while the reader is busy, without logging', async () => {
    const { service, generator, products, logError } = await setUp();
    products.failWith = new ProviderBusyError('Claude', 30);

    await onlyScene(service.createScene(sceneRequest('table')));

    expect(generator.requests[0]?.prompt).not.toContain('Product details');
    expect(logError).not.toHaveBeenCalled();
  });

  it('makes the scene without product details when reading breaks, and logs why', async () => {
    const { service, generator, products, logError } = await setUp();
    const broken = new Error('preview cache is broken');
    products.failWith = broken;

    await onlyScene(service.createScene(sceneRequest('table')));

    expect(generator.requests[0]?.prompt).not.toContain('Product details');
    expect(logError).toHaveBeenCalledWith(broken);
  });

  it('refuses a photo that is not there before reading or generating anything', async () => {
    const { service, generator, products } = await setUp();

    await expect(
      service.createScene({
        designId: MUG,
        mockupId: 'gone',
        prompt: 'table',
        candidates: 2,
        look: PLAIN,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect([products.requests, generator.requests]).toEqual([[], []]);
  });

  it("describes a reference photo's style for the design's product", async () => {
    const { service, reader, take } = await setUp();

    expect(await service.describeSceneStyle({ designId: SHIRT, image: 'AQ==' })).toEqual({
      found: true,
      description: 'Place the mug on a wooden table.',
      look: {},
    });
    expect(take).toHaveBeenCalledWith('AQ==');
    expect(reader.requests[0]?.productType).toBe('t shirt');
  });

  it('makes a scene in the chosen look and keeps the look with it', async () => {
    const { service, generator } = await setUp();
    const look = { shape: '3:4', lighting: 'studio', cameraHeight: 'topDown' } as const;

    const scene = await onlyScene(
      service.createScene({ designId: MUG, mockupId: 'm1', prompt: 'table', candidates: 1, look }),
    );

    expect(generator.requests[0]?.shape).toBe('3:4');
    expect(scene.sceneLook).toEqual({ shape: '3:4', lighting: 'studio' });
  });

  it("previews a look's line with the options offered for the product, without asking a service", async () => {
    const { service, reader, generator } = await setUp();

    const preview = await service.previewSceneLook({
      familyId: 'mug',
      look: { shape: '1:1', props: 'bare', cameraHeight: 'topDown' },
    });
    const plain = await service.previewSceneLook({ familyId: 't-shirt', look: PLAIN });

    expect(preview.line).toMatch(/^Look \(.*\): no props\.$/);
    expect(preview.options.cameraHeight).toEqual(['eyeLevel', 'slightlyAbove']);
    expect(preview.options.season).toEqual([]);
    expect(plain).toMatchObject({ line: null });
    expect(plain.options.cameraHeight).toContain('topDown');
    expect([reader.requests, generator.requests]).toEqual([[], []]);
  });

  it('describes nothing when the seller cancels choosing a photo', async () => {
    const { service, reader, take } = await setUp();
    take.mockResolvedValueOnce(null);

    expect(await service.describeSceneStyle({ designId: MUG })).toBeNull();
    expect(take).toHaveBeenCalledWith(undefined);
    expect(reader.requests).toEqual([]);
  });

  it('refuses a second scene while one is generated', async () => {
    const { service, generator } = await setUp();
    const { generating, finish } = holdNextScene(generator);

    const first = service.createScene(sceneRequest('table'));
    await generating;
    await expect(service.createScene(sceneRequest('beach'))).rejects.toMatchObject({
      code: 'SCENE_IN_PROGRESS',
    });
    finish();
    expect(await first).toMatchObject({ scenes: [{ view: 'Scene' }] });
  });

  it('refuses checking, confirming or reading a style for the design while a scene is generated', async () => {
    const { service, generator, inspector } = await setUp();
    const { generating, finish } = holdNextScene(generator);

    const first = service.createScene(sceneRequest('table'));
    await generating;
    await expect(service.checkSceneAgain({ designId: MUG, mockupId: 'm1' })).rejects.toMatchObject({
      code: 'SCENE_IN_PROGRESS',
    });
    await expect(
      service.confirmScenePrint({ designId: MUG, mockupId: 'm1', confirmed: true }),
    ).rejects.toMatchObject({ code: 'SCENE_IN_PROGRESS' });
    await expect(service.describeSceneStyle({ designId: MUG })).rejects.toMatchObject({
      code: 'SCENE_IN_PROGRESS',
    });
    finish();
    await first;
    expect(inspector.compared).toHaveLength(1);
  });

  it('refuses new scene work once closing and waits for the scene under way', async () => {
    const { service, generator, mockups } = await setUp();
    const { generating, finish } = holdNextScene(generator);

    const first = service.createScene(sceneRequest('table'));
    await generating;
    const closed = service.close();
    await expect(
      service.createScene({
        designId: SHIRT,
        mockupId: 'm1',
        prompt: 'beach',
        candidates: 1,
        look: PLAIN,
      }),
    ).rejects.toThrow('The app is closing');
    finish();
    await closed;
    await first;
    expect((await mockups.listForDesign(MUG)).map((mockup) => mockup.view)).toEqual([
      'Scene',
      'Front',
    ]);
  });

  it('lets another design make a scene meanwhile', async () => {
    const { service, generator, mockups } = await setUp();
    await mockups.replace(SHIRT, { variantId: '4000', printArea: 'front' }, [
      { ...photo, id: 'm2' as MockupId, designId: SHIRT },
    ]);
    const { generating, finish } = holdNextScene(generator);

    const first = service.createScene(sceneRequest('table'));
    await generating;
    const other = await onlyScene(
      service.createScene({
        designId: SHIRT,
        mockupId: 'm2',
        prompt: 'beach',
        candidates: 1,
        look: PLAIN,
      }),
    );
    finish();

    expect(other).toMatchObject({ view: 'Scene' });
    expect(await first).toMatchObject({ scenes: [{ view: 'Scene' }] });
  });
});
