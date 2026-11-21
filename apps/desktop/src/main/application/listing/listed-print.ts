import { type CatalogApi, type DesignDto } from '@pod/contracts';
import { listedPrintOf, listingPrint, type ListedPrint } from '@pod/rules';
import type { SettingsStore } from '../settings/settings-store.js';

/** Checks the design's print and picks the variants its listing sells, as the settings say. */
export async function listedPrint(
  catalog: Pick<CatalogApi, 'checkPrint'>,
  settings: Pick<SettingsStore, 'get'>,
  design: Pick<DesignDto, 'id' | 'familyId'>,
): Promise<ListedPrint> {
  const [check, { listingSizes }] = await Promise.all([
    catalog.checkPrint(listingPrint(design)),
    settings.get(),
  ]);
  return listedPrintOf(check, listingSizes[design.familyId]);
}
