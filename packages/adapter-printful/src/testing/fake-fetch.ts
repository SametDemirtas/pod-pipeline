import type { FakeReply } from '@pod/adapter-http/testing';

/** A successful Printful v1 response. */
export function ok(result: unknown): FakeReply {
  return { body: { code: 200, result } };
}
