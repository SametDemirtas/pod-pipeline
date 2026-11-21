import type {
  Concept,
  Design,
  DesignDetails,
  DesignId,
  DesignView,
  KeptOrientation,
} from '../catalog/model.js';
import type { ProductFamilyId } from '../catalog/product-family.js';
import type { Page, PageRequest } from '../pagination.js';

export interface ConceptRepository {
  findByKey(key: string): Promise<Concept | undefined>;
  /**
   * Inserts a concept, or renames the stored concept with the same id.
   * Rejects with `ValidationError` for a malformed key and with
   * `ConflictError` if the key belongs to a different concept or the id is
   * stored under a different key.
   */
  save(concept: Concept): Promise<void>;
}

export interface DesignRepository {
  findByKey(designKey: string): Promise<Design | undefined>;
  /**
   * Inserts revision 1 of a new design, or the next revision of a stored one.
   * Earlier revisions are kept as history. Rejects with `ValidationError` for
   * a malformed key and with `ConflictError` if the revision is not the next
   * one, the id differs from the stored design with that key, or the concept
   * does not exist.
   */
  save(design: Design): Promise<void>;
  /**
   * Records that the design's artwork is left unturned, without a new
   * revision; later revisions keep it. Rejects with `NotFoundError` when no
   * design has the id.
   */
  keepOrientation(id: DesignId, kept: KeptOrientation): Promise<void>;
}

export interface CatalogWriter {
  readonly concepts: ConceptRepository;
  readonly designs: DesignRepository;
}

export interface UnitOfWork {
  /**
   * Runs `work` with repositories bound to one transaction: every write
   * commits together or none does. Other callers wait until it finishes, so
   * they never see uncommitted data. Inside `work`, use only `tx`: starting
   * another transaction or using the store's own repositories rejects, and so
   * does using `tx` after `run` has settled.
   */
  run<T>(work: (tx: CatalogWriter) => Promise<T>): Promise<T>;
}

export interface DesignListFilter {
  readonly familyId?: ProductFamilyId | undefined;
  /**
   * Matches designs whose key or concept name contains this text, after both
   * are folded with `foldForSearch`. Wildcard characters have no meaning.
   */
  readonly search?: string | undefined;
}

/**
 * Read side of the catalog. Designs are listed in `compareDesignKeys` order;
 * pages continue after the design key encoded in the cursor, so a walk never
 * repeats a design. Designs added before the cursor while walking appear only
 * on a fresh walk, so `total` may then exceed the items the walk returned.
 */
export interface CatalogQuery {
  listDesigns(filter: DesignListFilter, page: PageRequest): Promise<Page<DesignView>>;
  /** The design with its concept and every stored revision, read consistently. */
  getDesign(id: DesignId): Promise<DesignDetails | undefined>;
}
