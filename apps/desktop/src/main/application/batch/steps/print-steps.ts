import { PrintQualityPoorError } from '../../errors/batch-errors.js';
import { type DesignDetailDto, type PrintCheckDto } from '@pod/contracts';
import { listingPrint, providerPhotos, lowestDpiPrint } from '@pod/rules';
import type { SettingsStore } from '../../settings/settings-store.js';
import { listedPrint } from '../../listing/listed-print.js';
import { DONE, SKIPPED, type BatchCatalog, type StepRunner } from '../step-runner.js';
import { whenFree, type Wait } from '../busy-waits.js';

/** The check of the size the design prints worst on, each on its own print area. */
export async function worstListedPrint(
  catalog: Pick<BatchCatalog, 'checkPrint'>,
  settings: Pick<SettingsStore, 'get'>,
  design: DesignDetailDto,
): Promise<PrintCheckDto | undefined> {
  const listed = await listedPrint(catalog, settings, design);
  const checks = await Promise.all(
    listed.variantIds.map((id) =>
      id === listed.check.variantId
        ? Promise.resolve(listed.check)
        : catalog.checkPrint(listingPrint(design, id)),
    ),
  );
  return lowestDpiPrint(checks);
}

/**
 * Checks the design prints sharp enough on every size its listing sells and
 * names the size it prints worst on.
 */
export function printStep(
  catalog: Pick<BatchCatalog, 'getDesign' | 'checkPrint'>,
  settings: Pick<SettingsStore, 'get'>,
): StepRunner {
  return async (item) => {
    const design = await catalog.getDesign({ id: item.designId });
    const worst = await worstListedPrint(catalog, settings, design);
    if (worst?.quality === 'poor') {
      const size = worst.variants.find((variant) => variant.id === worst.variantId)?.size ?? null;
      throw new PrintQualityPoorError(worst.effectiveDpi, size);
    }
    return DONE;
  };
}

/** Has Printful photograph the current revision, unless it has photos already. */
export function mockupsStep(
  catalog: Pick<BatchCatalog, 'getDesign' | 'checkPrint' | 'listMockups' | 'createMockups'>,
  settings: Pick<SettingsStore, 'get'>,
  wait: Wait,
): StepRunner {
  return async (item, _run, signal) => {
    const [design, mockups] = await Promise.all([
      catalog.getDesign({ id: item.designId }),
      catalog.listMockups({ id: item.designId }),
    ]);
    if (providerPhotos(mockups, design.revision).length > 0) return SKIPPED;
    // One size is photographed: the first the listing sells.
    const { mainVariantId } = await listedPrint(catalog, settings, design);
    await whenFree(() => catalog.createMockups(listingPrint(design, mainVariantId)), wait, signal);
    return DONE;
  };
}
