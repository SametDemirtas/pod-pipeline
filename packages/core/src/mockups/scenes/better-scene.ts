import type { Mockup } from '../mockup.js';

/**
 * The better of two scenes made alike: the one whose print was found unchanged,
 * then the one with fewer issues, then the first. `undefined` while either is
 * unchecked, as then only the seller can tell.
 */
export function betterScene(first: Mockup, second: Mockup): Mockup | undefined {
  const [a, b] = [first.sceneCheck, second.sceneCheck];
  if (!a || !b) return undefined;
  if (a.same !== b.same) return a.same ? first : second;
  return b.issues.length < a.issues.length ? second : first;
}
