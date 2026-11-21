import { describe, expect, it } from 'vitest';
import { defaultBatchSteps, withBatchStep } from './batch-steps.js';

describe('defaultBatchSteps', () => {
  it('upscales only when the settings say so', () => {
    expect(defaultBatchSteps(false)).not.toContain('upscale');
    expect(defaultBatchSteps(true)[0]).toBe('upscale');
  });
});

describe('withBatchStep', () => {
  it('ties a draft to the text and mockups it is made of', () => {
    expect(withBatchStep(['print'], 'draft', true)).toEqual(['print', 'mockups', 'text', 'draft']);
    expect(withBatchStep(['mockups', 'text', 'draft'], 'mockups', false)).toEqual(['text']);
    expect(withBatchStep(['research', 'draft'], 'research', false)).toEqual(['draft']);
  });
});
