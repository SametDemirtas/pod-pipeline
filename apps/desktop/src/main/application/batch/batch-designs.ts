import {
  MAX_BATCH_DESIGNS,
  MAX_PAGE_SIZE,
  type BatchSelection,
  type CatalogApi,
  type DesignDto,
} from '@pod/contracts';
import { importedRevisionOf } from '@pod/rules';
import { ValidationError, type BatchDesign, type DesignId } from '@pod/core';

/**
 * Each design picked, or those the filter matches in catalog order but the
 * ones unticked; at most a job's worth.
 */
export async function selectedDesigns(
  catalog: Pick<CatalogApi, 'listDesigns' | 'getDesign'>,
  selection: BatchSelection,
): Promise<readonly DesignDto[]> {
  if (selection.kind === 'designs') {
    const ids = [...new Set(selection.designIds)];
    return Promise.all(ids.map((id) => catalog.getDesign({ id })));
  }
  const { familyId, search } = selection;
  const excluded = new Set(selection.excludeIds);
  const designs: DesignDto[] = [];
  let cursor: string | undefined;
  do {
    const page = await catalog.listDesigns({
      ...(familyId === undefined ? {} : { familyId }),
      ...(search === undefined ? {} : { search }),
      limit: MAX_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    designs.push(...page.items.filter((design) => !excluded.has(design.id)));
    if (designs.length > MAX_BATCH_DESIGNS) {
      throw new ValidationError('selection', `choose at most ${String(MAX_BATCH_DESIGNS)} designs`);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  if (designs.length === 0) throw new ValidationError('selection', 'matches no design');
  return designs;
}

/**
 * The design as a job takes it, with the revision its imported artwork came
 * in; the revisions are read only for artwork made larger or turned in the app.
 */
export async function batchDesign(
  catalog: Pick<CatalogApi, 'getDesign'>,
  design: DesignDto,
): Promise<BatchDesign> {
  const madeHere = design.upscaleModel !== null || design.rotation !== null;
  return {
    id: design.id as DesignId,
    designKey: design.designKey,
    revision: design.revision,
    importedRevision: madeHere
      ? importedRevisionOf(await catalog.getDesign({ id: design.id }))
      : design.revision,
  };
}
