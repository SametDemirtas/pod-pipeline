import { describe, expect, it, vi } from 'vitest';
import { AiNotConnectedError } from '../errors/connection-errors.js';
import { ProviderFailedError } from '../errors/provider-errors.js';
import { MUG, sceneRequest, setUp } from '../../testing/scene-service-setup.js';

describe('SceneService candidates', () => {
  it('keeps the better of two checked candidates and removes the other', async () => {
    const { service, inspector, mockups, catalogChanged } = await setUp();
    const checks = [{ same: false, issues: ['3: mirrored'], unverifiable: [] }];
    const compare = inspector.compare.bind(inspector);
    inspector.compare = (original, scene) =>
      checks.length > 0
        ? Promise.resolve(checks.shift() ?? inspector.answer)
        : compare(original, scene);

    const kept = await service.createScene(sceneRequest('table', 2));

    expect(kept.candidateFailed).toBe(false);
    expect(kept.scenes.map((scene) => [scene.id, scene.sceneCheck?.same])).toEqual([
      ['scene-0002', true],
    ]);
    expect((await mockups.listForDesign(MUG)).map((mockup) => mockup.id)).toEqual([
      'scene-0002',
      'm1',
    ]);
    expect(catalogChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps both candidates for the seller when they cannot be checked', async () => {
    const { service, inspector, mockups } = await setUp();
    inspector.failWith = new AiNotConnectedError('Claude');

    const kept = await service.createScene(sceneRequest('table', 2));

    expect(kept.scenes.map((scene) => scene.id)).toEqual(['scene-0001', 'scene-0002']);
    expect(await mockups.listForDesign(MUG)).toHaveLength(3);
  });

  it('keeps both checked candidates and still announces them when removing one fails', async () => {
    const { service, mockups, catalogChanged, logError } = await setUp();
    const broken = new Error('database is locked');
    mockups.remove = () => Promise.reject(broken);

    const kept = await service.createScene(sceneRequest('table', 2));

    expect(kept.scenes).toHaveLength(2);
    expect(catalogChanged).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(broken);
  });

  it('keeps the candidate made when the other fails, says so and logs only unexpected failures', async () => {
    const { service, generator, logError } = await setUp();
    const broken = new Error('disk full');
    const generate = generator.generate.bind(generator);
    // Each request makes two: one fails, one is made.
    const failures = [broken, undefined, new ProviderFailedError('Gemini', 'blocked')];
    generator.generate = (request) => {
      const failure = failures.shift();
      return failure ? Promise.reject(failure) : generate(request);
    };
    const request = sceneRequest('table', 2);

    for (const created of [
      await service.createScene(request),
      await service.createScene(request),
    ]) {
      expect(created.scenes).toHaveLength(1);
      expect(created.candidateFailed).toBe(true);
    }
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(broken);
  });

  it('passes on the first failure when no candidate is made and logs an unexpected other', async () => {
    const { service, generator, mockups, logError } = await setUp();
    const broken = new Error('disk full');
    const failures = [new ProviderFailedError('Gemini', 'quota exceeded'), broken];
    generator.generate = () => Promise.reject(failures.shift() ?? broken);

    await expect(service.createScene(sceneRequest('table', 2))).rejects.toThrow('quota exceeded');
    expect(await mockups.listForDesign(MUG)).toHaveLength(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(broken);
  });

  it('waits for both candidates under way when closing', async () => {
    const { service, generator, mockups } = await setUp();
    const generate = generator.generate.bind(generator);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    generator.generate = async (request) => {
      started += 1;
      await released;
      return generate(request);
    };
    const making = service.createScene(sceneRequest('table', 2));
    await vi.waitFor(() => {
      expect(started).toBe(2);
    });
    let closedYet = false;
    const closed = service.close().then(() => {
      closedYet = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closedYet).toBe(false);
    release();
    await closed;

    expect((await making).scenes.map((scene) => scene.id)).toEqual(['scene-0001']);
    expect((await mockups.listForDesign(MUG)).map((mockup) => mockup.id)).toEqual([
      'scene-0001',
      'm1',
    ]);
  });
});
