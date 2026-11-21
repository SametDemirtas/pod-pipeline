/** A model a seller may pick, and whether it reads images. */
export interface ModelOption {
  readonly id: string;
  readonly seesImages: boolean;
}

/** The models suggested to the seller for one service, best first, and the one preselected. */
export interface ModelCatalog {
  readonly defaultModel: string;
  readonly models: readonly ModelOption[];
}

/** The text models suggested for one service, with the one preselected for checking scenes. */
export interface TextModelCatalog extends ModelCatalog {
  /** The cheapest listed model that reads images, which is enough to compare a scene. */
  readonly defaultCheckModel: string;
  /** Whether a model missing from `models` reads images. */
  readonly othersSeeImages: boolean;
}

/**
 * Whether model `id` reads images. A seller may pick a model the catalog does
 * not list, which reads images when `unlisted` says so.
 */
export function seesImages(catalog: ModelCatalog, id: string, unlisted: boolean): boolean {
  return catalog.models.find((option) => option.id === id)?.seesImages ?? unlisted;
}
