import type { TFunction } from 'i18next';
import { familyProfileOf, type SizeKind } from '@pod/rules';

const KNOWN_AREAS = ['default', 'front', 'back'] as const;
const KNOWN_VIEWS = ['front', 'back', 'left', 'right'] as const;

/** `label_inside` becomes `Label inside`. */
function humanize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
}

/** Printful names print areas in English; the common ones are translated, others tidied up. */
export function areaLabel(t: TFunction, placement: string): string {
  const known = KNOWN_AREAS.find((candidate) => candidate === placement);
  return known ? t(`print.areas.${known}`) : humanize(placement);
}

const SIZE_LABELS = {
  clothing: 'print.clothingSize',
  model: 'print.model',
  size: 'print.size',
} as const satisfies Record<SizeKind, string>;

/** What a variant's size is called for the product: a clothing size, a phone model or a size. */
export function sizeLabel(t: TFunction, familyId: string): string {
  return t(SIZE_LABELS[familyProfileOf(familyId).sizeKind]);
}

/**
 * Printful names views in English, and the main view after the area printed on,
 * `default` being the front. The common ones are translated, others tidied up.
 */
export function viewLabel(t: TFunction, view: string): string {
  const name = view === 'default' ? 'front' : view.toLowerCase();
  const known = KNOWN_VIEWS.find((candidate) => candidate === name);
  return known ? t(`mockups.views.${known}`) : humanize(view);
}
