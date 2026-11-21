import { describe, expect, it } from 'vitest';
import { previewDto } from '../../testing/fake-api.js';
import { hasWork, importReducer, INITIAL_IMPORT_STATE } from './import-flow.js';

describe('import flow', () => {
  const preview = previewDto();
  const result = {
    created: ['01-mug'],
    updated: [],
    unchanged: 0,
    skipped: 0,
    renamedConceptKeys: [],
  };

  it('walks from choosing a folder to a finished import', () => {
    let state = importReducer(INITIAL_IMPORT_STATE, { type: 'check', rootPath: '/d' });
    expect(state).toEqual({ step: 'checking', rootPath: '/d' });
    state = importReducer(state, { type: 'checked', preview });
    expect(state).toEqual({ step: 'review', preview });
    state = importReducer(state, { type: 'import' });
    expect(state).toEqual({ step: 'importing', preview });
    state = importReducer(state, { type: 'imported', result });
    expect(state).toEqual({ step: 'done', result });
    expect(importReducer(state, { type: 'reset' })).toBe(INITIAL_IMPORT_STATE);
  });

  it('ignores events that do not fit the current step', () => {
    expect(importReducer(INITIAL_IMPORT_STATE, { type: 'checked', preview })).toBe(
      INITIAL_IMPORT_STATE,
    );
    expect(importReducer(INITIAL_IMPORT_STATE, { type: 'import' })).toBe(INITIAL_IMPORT_STATE);
    expect(importReducer(INITIAL_IMPORT_STATE, { type: 'imported', result })).toBe(
      INITIAL_IMPORT_STATE,
    );
  });

  it('refuses to import a preview with nothing to do', () => {
    const idle = previewDto({ counts: { new: 0, changed: 0, unchanged: 3, skipped: 0 } });
    const review = { step: 'review', preview: idle } as const;

    expect(hasWork(idle)).toBe(false);
    expect(importReducer(review, { type: 'import' })).toBe(review);
    expect(hasWork({ ...idle, conceptRenames: [{ conceptKey: '01', from: 'a', to: 'b' }] })).toBe(
      true,
    );
  });

  it('remembers the folder when a step fails', () => {
    const error = new Error('x');

    expect(importReducer({ step: 'checking', rootPath: '/d' }, { type: 'failed', error })).toEqual({
      step: 'failed',
      error,
      rootPath: '/d',
    });
    expect(importReducer({ step: 'importing', preview }, { type: 'failed', error })).toEqual({
      step: 'failed',
      error,
      rootPath: preview.rootPath,
    });
    expect(importReducer(INITIAL_IMPORT_STATE, { type: 'failed', error })).toEqual({
      step: 'failed',
      error,
      rootPath: null,
    });
  });
});
