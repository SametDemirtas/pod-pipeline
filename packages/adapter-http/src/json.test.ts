import { describe, expect, it } from 'vitest';
import { jsonReaders, readJsonResponse } from './json.js';

const read = jsonReaders((what) => new TypeError(`Bad answer: ${what}`));

describe('jsonReaders', () => {
  it('returns values of the documented shape and names what was wrong otherwise', () => {
    expect(read.objectAt({ a: 1 }, 'shop')).toEqual({ a: 1 });
    expect(read.arrayAt([1], 'items')).toEqual([1]);
    expect(read.stringAt('x', 'name')).toBe('x');
    expect(read.numberAt(2, 'count')).toBe(2);
    expect(read.idAt(42, 'id')).toBe('42');
    expect(read.idAt('42', 'id')).toBe('42');
    expect(() => read.objectAt([], 'shop')).toThrow('Bad answer: shop is not an object');
    expect(() => read.arrayAt({}, 'items')).toThrow('items is not a list');
    expect(() => read.stringAt(1, 'name')).toThrow('name is not text');
    expect(() => read.numberAt(Number.NaN, 'count')).toThrow('count is not a number');
    expect(() => read.idAt(2 ** 60, 'id')).toThrow('id is not an id');
    expect(() => read.idAt('4a', 'id')).toThrow('id is not an id');
  });
});

describe('readJsonResponse', () => {
  const explain = (body: Readonly<Record<string, unknown>>) => body['message'];
  const failed = (status: number, message: string) => new Error(`${status}: ${message}`);

  it('returns the body of a successful answer', async () => {
    expect(await readJsonResponse(Response.json({ a: 1 }), explain, failed)).toEqual({ a: 1 });
    expect(await readJsonResponse(new Response(null, { status: 204 }), explain, failed)).toBe(
      undefined,
    );
  });

  it("throws the service's explanation, or the status text without one", async () => {
    await expect(
      readJsonResponse(
        Response.json({ message: 'Board not found' }, { status: 404 }),
        explain,
        failed,
      ),
    ).rejects.toThrow('404: Board not found');
    await expect(
      readJsonResponse(
        Response.json({ message: '' }, { status: 400, statusText: 'Bad Request' }),
        explain,
        failed,
      ),
    ).rejects.toThrow('400: Bad Request');
    await expect(
      readJsonResponse(new Response('<html>', { status: 502 }), explain, failed),
    ).rejects.toThrow('502: request failed');
  });

  it('passes on the wait a rate-limited answer asks for', async () => {
    const waits: (number | undefined)[] = [];
    const record = (status: number, message: string, retryAfter?: number) => {
      waits.push(retryAfter);
      return new Error(`${status}: ${message}`);
    };
    const limited = new Response('{}', { status: 429, headers: { 'Retry-After': '20' } });

    await expect(readJsonResponse(limited, explain, record)).rejects.toThrow('429');
    await expect(
      readJsonResponse(new Response('{}', { status: 429 }), explain, record),
    ).rejects.toThrow('429');
    expect(waits).toEqual([20, undefined]);
  });
});
