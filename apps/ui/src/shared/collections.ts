/** A copy of the set with the value added or taken out. */
export function toggled<T>(values: ReadonlySet<T>, value: T, on: boolean): Set<T> {
  const next = new Set(values);
  if (on) next.add(value);
  else next.delete(value);
  return next;
}

/** A copy of the list with the value added last or taken out, keeping the others' order. */
export function toggledIn<T>(values: readonly T[], value: T, on: boolean): T[] {
  const without = values.filter((candidate) => candidate !== value);
  return on ? [...without, value] : without;
}
