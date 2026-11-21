import type { FieldHit } from './mark-tells.js';

/** Whether `inner` lies within the words of `outer`, in the same field. */
export const within = (inner: FieldHit, outer: FieldHit): boolean =>
  inner.field === outer.field &&
  outer.index <= inner.index &&
  inner.index + inner.match.length <= outer.index + outer.match.length;

const overlaps = (a: FieldHit, b: FieldHit) =>
  a.field === b.field && a.index < b.index + b.match.length && b.index < a.index + a.match.length;

/** One sign: a list entry however it is worded, as the lists were measured, or a mark by its wording. */
const signOf = (hit: FieldHit) => hit.id ?? `${hit.category} ${hit.match.toLowerCase()}`;

/** Whether two different signs stand on words that do not overlap, so they count as two. */
export function twoSigns(hits: readonly FieldHit[]): boolean {
  return hits.some((a, i) =>
    hits.slice(i + 1).some((b) => signOf(a) !== signOf(b) && !overlaps(a, b)),
  );
}

/** The hits not inside another one; of two on the same words, the first. */
export function outermost(hits: readonly FieldHit[]): FieldHit[] {
  return hits.filter(
    (hit, i) =>
      !hits.some((other, j) => j !== i && within(hit, other) && (!within(other, hit) || j < i)),
  );
}
