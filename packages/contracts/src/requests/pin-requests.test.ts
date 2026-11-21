import { describe, expect, it } from 'vitest';
import { MAX_REFERENCE_IMAGE_BYTES } from '../limits.js';
import { describeSceneStyleRequest, planPinRequest } from './index.js';

const pin = {
  designId: 'design-01-mug',
  mockupId: 'm1',
  title: 'Tulip mug',
  description: '',
  altText: '',
  headline: '',
  boardId: '5001',
  publishAt: '2026-11-02T18:00:00+01:00',
};

describe('planPinRequest', () => {
  it('takes a pin with its time in any offset', () => {
    expect(planPinRequest.parse(pin)).toEqual(pin);
    expect(planPinRequest.safeParse({ ...pin, publishAt: '2026-11-02T17:00:00Z' }).success).toBe(
      true,
    );
  });

  it('refuses a time without an offset and a board id that is not digits', () => {
    expect(planPinRequest.safeParse({ ...pin, publishAt: '2026-11-02T18:00:00' }).success).toBe(
      false,
    );
    expect(planPinRequest.safeParse({ ...pin, boardId: 'b-5001' }).success).toBe(false);
    expect(planPinRequest.safeParse({ ...pin, boardId: '' }).success).toBe(false);
  });

  it('refuses fields it does not know', () => {
    expect(planPinRequest.safeParse({ ...pin, publish: true }).success).toBe(false);
  });
});

describe('describeSceneStyleRequest', () => {
  it('takes an image up to the size limit as base64', () => {
    // Every four base64 characters stand for three bytes.
    const encoded = (bytes: number) => 'A'.repeat(Math.ceil(bytes / 3) * 4);
    const request = (image: string) =>
      describeSceneStyleRequest.safeParse({ designId: 'design-01-mug', image });

    expect(request(encoded(MAX_REFERENCE_IMAGE_BYTES)).success).toBe(true);
    expect(request(encoded(MAX_REFERENCE_IMAGE_BYTES + 3)).success).toBe(false);
    expect(request('not base64!').success).toBe(false);
  });
});
