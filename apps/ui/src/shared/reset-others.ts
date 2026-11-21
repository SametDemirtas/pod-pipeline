interface Resettable {
  reset: () => void;
}

/** Clears the outcome of every change but `keep`, so only the latest one shows its error. */
export function resetOthers(changes: readonly Resettable[], keep: Resettable): void {
  for (const change of changes) if (change !== keep) change.reset();
}
