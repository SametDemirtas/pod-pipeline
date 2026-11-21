import type { TFunction } from 'i18next';
import { en } from '../i18n/locales/en.js';

type TranslatedFamily = keyof typeof en.families;

const isTranslated = (familyId: string): familyId is TranslatedFamily =>
  Object.hasOwn(en.families, familyId);

/** Translated product name; families without a translation fall back to their id. */
export function familyLabel(t: TFunction, familyId: string): string {
  return isTranslated(familyId) ? t(`families.${familyId}`) : familyId;
}

/** What a design shows, e.g. `Frost Garden Mug`; the product alone for an unnamed concept. */
export function designTitle(conceptName: string | null, family: string): string {
  return conceptName === null ? family : `${conceptName} ${family}`;
}
