import { SequentialIds } from '@pod/core/testing';
import { describe, expect, it } from 'vitest';
import { objectKey } from './object-key.js';

describe('objectKey', () => {
  it('puts each file in its own random folder', () => {
    const ids = new SequentialIds();

    expect(objectKey('01-mug-r2.png', ids)).toBe('pod-pipeline/id-0001/01-mug-r2.png');
    expect(objectKey('01-mug-r2.png', ids)).toBe('pod-pipeline/id-0002/01-mug-r2.png');
  });

  it('keeps the name inside that folder', () => {
    expect(objectKey('../a\\b/c.png', new SequentialIds())).toBe(
      'pod-pipeline/id-0001/.._a_b_c.png',
    );
  });
});
