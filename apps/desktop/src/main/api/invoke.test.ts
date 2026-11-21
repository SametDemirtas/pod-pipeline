import { describe, expect, it, vi } from 'vitest';
import { byName } from '../testing/operation-by-name.js';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { invoke } from './invoke.js';
import { catalogOperations } from './operations.js';

describe('invoke', () => {
  it('wraps values and errors as results', async () => {
    const log = vi.fn();
    const operations = catalogOperations(fakeCatalog());

    expect(await invoke(byName(operations, 'listFamilies'), undefined, log)).toEqual({
      ok: true,
      value: [],
    });
    expect(await invoke(byName(operations, 'listImportFolders'), undefined, log)).toEqual({
      ok: true,
      value: [],
    });
    expect(await invoke(byName(operations, 'getDesign'), { id: 'x' }, log)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await invoke(byName(operations, 'getDesign'), { nope: 1 }, log)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(
      await invoke(byName(operations, 'runImport'), { rootPath: '/d', fingerprint: 'f' }, log),
    ).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(log).toHaveBeenCalledTimes(1);
  });
});
