import { isFamilyId } from './keys.js';
import { normalizeLabel } from './text-folding.js';

export type ProductFamilyId = string & { readonly __brand: 'ProductFamilyId' };

export interface ProductFamily {
  /** Lower-case words joined by hyphens; part of every design key, e.g. `01-mug`. */
  readonly id: ProductFamilyId;
  /** File names (without extension) recognised as this family, in any supported language. */
  readonly fileAliases: readonly string[];
  /**
   * Another family whose file this one is also made from when a concept has no
   * file of its own for it, e.g. Samsung cases from the phone case artwork.
   */
  readonly artworkOf?: ProductFamilyId | undefined;
}

export function productFamilyId(value: string): ProductFamilyId {
  return value as ProductFamilyId;
}

/** The family as words a reader understands, e.g. `phone case` for `phone-case`. */
export function productTypeOf(id: ProductFamilyId): string {
  return id.replace(/-/g, ' ');
}

export class ProductFamilyCatalog {
  private readonly byId = new Map<ProductFamilyId, ProductFamily>();
  private readonly byAlias = new Map<string, ProductFamily>();

  constructor(families: readonly ProductFamily[]) {
    for (const family of families) this.add(family);
    for (const family of families) {
      if (family.artworkOf !== undefined && !this.byId.has(family.artworkOf)) {
        throw new Error(
          `Product family ${family.id} uses the artwork of unknown ${family.artworkOf}`,
        );
      }
    }
  }

  all(): readonly ProductFamily[] {
    return [...this.byId.values()];
  }

  get(id: ProductFamilyId): ProductFamily | undefined {
    return this.byId.get(id);
  }

  findByFileName(stem: string): ProductFamily | undefined {
    return this.byAlias.get(normalizeLabel(stem));
  }

  /** Families also made from the artwork of `id` when a concept has no file of theirs. */
  usingArtworkOf(id: ProductFamilyId): ProductFamily[] {
    return this.all().filter((family) => family.artworkOf === id);
  }

  private add(family: ProductFamily): void {
    if (!isFamilyId(family.id)) {
      throw new Error(
        `Product family id "${family.id}" must be lower-case words joined by hyphens`,
      );
    }
    if (this.byId.has(family.id)) throw new Error(`Product family id "${family.id}" is used twice`);

    const aliases = family.fileAliases.map(normalizeLabel);
    if (aliases.length === 0 || aliases.some((alias) => !alias)) {
      throw new Error(`Product family ${family.id} needs non-empty file aliases`);
    }
    for (const alias of aliases) {
      const sameAlias = this.byAlias.get(alias);
      if (sameAlias && sameAlias.id !== family.id) {
        throw new Error(`Alias "${alias}" is used by both ${sameAlias.id} and ${family.id}`);
      }
    }

    this.byId.set(family.id, family);
    for (const alias of aliases) this.byAlias.set(alias, family);
  }
}
