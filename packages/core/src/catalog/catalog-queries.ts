import { NotFoundError, ValidationError } from '../errors.js';
import { normalizePageRequest, type Page } from '../pagination.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { DesignDetails, DesignId, DesignView } from './model.js';
import { productFamilyId, type ProductFamilyCatalog } from './product-family.js';
import { characterCount } from '@pod/rules';

/** Maximum search length in characters (code points, so emoji count once). */
export const MAX_SEARCH_CHARACTERS = 100;

export interface ListDesignsInput {
  readonly familyId?: string | undefined;
  readonly search?: string | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export class ListDesigns {
  constructor(
    private readonly query: Pick<CatalogQuery, 'listDesigns'>,
    private readonly families: Pick<ProductFamilyCatalog, 'get'>,
  ) {}

  async execute(input: ListDesignsInput = {}): Promise<Page<DesignView>> {
    const page = normalizePageRequest(input);

    const familyId = input.familyId ? productFamilyId(input.familyId) : undefined;
    if (familyId && !this.families.get(familyId)) {
      throw new ValidationError('familyId', `unknown product family "${familyId}"`);
    }

    const search = input.search?.trim();
    if (search && characterCount(search) > MAX_SEARCH_CHARACTERS) {
      throw new ValidationError('search', `must be at most ${MAX_SEARCH_CHARACTERS} characters`);
    }

    return this.query.listDesigns({ familyId, search: search || undefined }, page);
  }
}

/** The design with its revisions, or `NotFoundError` when there is none. */
export async function requireDesign(
  query: Pick<CatalogQuery, 'getDesign'>,
  id: string,
): Promise<DesignDetails> {
  const details = await query.getDesign(id as DesignId);
  if (!details) throw new NotFoundError('Design', id);
  return details;
}

export class GetDesign {
  constructor(private readonly query: Pick<CatalogQuery, 'getDesign'>) {}

  execute(id: string): Promise<DesignDetails> {
    return requireDesign(this.query, id);
  }
}
