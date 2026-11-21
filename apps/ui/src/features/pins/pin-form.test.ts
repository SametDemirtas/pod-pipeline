import { describe, expect, it } from 'vitest';
import {
  initialPinForm,
  localDateTime,
  nextSlot,
  pinFormProblems,
  toPlanPinRequest,
} from './pin-form.js';

const now = new Date(2026, 9, 26, 14, 35);
const form = initialPinForm({ title: 'Lantern Harbor', mockupId: 'm1', boardId: '5001', now });

describe('pin form', () => {
  it('starts with the design’s name and the next full hour after one hour', () => {
    expect(form).toMatchObject({ title: 'Lantern Harbor', publishAt: '2026-10-26T16:00' });
    expect(nextSlot(new Date(2026, 11, 31, 23, 10))).toBe('2027-01-01T01:00');
    expect(localDateTime(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
  });

  it('names the fields that are missing or too long', () => {
    expect(pinFormProblems(form, now)).toEqual([]);
    expect(
      pinFormProblems(
        {
          ...form,
          mockupId: '',
          boardId: '',
          title: ' ',
          headline: 'x'.repeat(61),
          publishAt: '',
        },
        now,
      ),
    ).toEqual(['mockupId', 'boardId', 'title', 'headline', 'publishAt']);
  });

  it('turns down a time that has passed, allowing a few minutes', () => {
    expect(pinFormProblems({ ...form, publishAt: '2026-10-26T14:31' }, now)).toEqual([]);
    expect(pinFormProblems({ ...form, publishAt: '2026-10-26T14:29' }, now)).toEqual([
      'publishAtPast',
    ]);
    expect(toPlanPinRequest('d1', { ...form, publishAt: '2026-10-25T09:00' }, now)).toBeNull();
  });

  it('shortens a long name by characters, never splitting an emoji', () => {
    const title = `${'a'.repeat(99)}👻👻`;

    expect(initialPinForm({ title, mockupId: 'm1', boardId: '5001', now }).title).toBe(
      `${'a'.repeat(99)}👻`,
    );
  });

  it('sends trimmed words and the time with its offset', () => {
    expect(toPlanPinRequest('d1', { ...form, title: ' Tulip ', headline: ' Boo ' }, now)).toEqual({
      designId: 'd1',
      mockupId: 'm1',
      boardId: '5001',
      title: 'Tulip',
      description: '',
      altText: '',
      headline: 'Boo',
      publishAt: new Date(2026, 9, 26, 16, 0).toISOString(),
    });
    expect(toPlanPinRequest('d1', { ...form, title: '' }, now)).toBeNull();
  });
});
