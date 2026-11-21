import type { SQLInputValue } from 'node:sqlite';
import {
  productFamilyId,
  type Concept,
  type ConceptId,
  type Design,
  type DesignId,
  type DesignView,
  IMAGE_MIME_TYPES,
  type ImageAsset,
  type ImageMimeType,
  isFitMode,
  isListingState,
  sceneLookOf,
  MARKET_REGIONS,
  type MarketRegion,
  type Listing,
  type ListingId,
  type ListingProductLink,
  type Mockup,
  type MockupId,
  type ProductDetails,
  QUARTER_TURNS,
  type SceneCheck,
  type SceneLook,
} from '@pod/core';

export type Row = Record<string, SQLInputValue>;

const MIME_TYPES: ReadonlySet<string> = new Set(IMAGE_MIME_TYPES);

export function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`Column ${column} is not text`);
  return value;
}

export function integer(row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Column ${column} is not an integer`);
  }
  return value;
}

export function date(row: Row, column: string): Date {
  const value = new Date(text(row, column));
  if (Number.isNaN(value.getTime())) throw new Error(`Column ${column} is not a date`);
  return value;
}

export function optionalText(row: Row, column: string): string | null {
  return row[column] === null ? null : text(row, column);
}

export function marketRegion(row: Row): MarketRegion {
  const value = text(row, 'market');
  const region = MARKET_REGIONS.find((known) => known === value);
  if (region === undefined) throw new Error(`Unknown stored market ${value}`);
  return region;
}

function mimeType(row: Row, column: string): ImageMimeType {
  const value = text(row, column);
  if (!MIME_TYPES.has(value)) throw new Error(`Unsupported stored MIME type ${value}`);
  return value as ImageMimeType;
}

/** The stored file columns every table with an image shares, after `prefix` when given. */
export function toImageAsset(row: Row, prefix = ''): ImageAsset {
  return {
    sha256: text(row, `${prefix}sha256`),
    storageKey: text(row, `${prefix}storage_key`),
    mimeType: mimeType(row, `${prefix}mime_type`),
    width: integer(row, `${prefix}width`),
    height: integer(row, `${prefix}height`),
    byteSize: integer(row, `${prefix}byte_size`),
  };
}

export function toConcept(row: Row): Concept {
  return {
    id: text(row, 'id') as ConceptId,
    key: text(row, 'key'),
    name: optionalText(row, 'name'),
    createdAt: date(row, 'created_at'),
  };
}

export function toDesign(row: Row): Design {
  return {
    id: text(row, 'id') as DesignId,
    designKey: text(row, 'design_key'),
    conceptId: text(row, 'concept_id') as ConceptId,
    familyId: productFamilyId(text(row, 'family_id')),
    revision: integer(row, 'revision'),
    asset: toImageAsset(row),
    sourcePath: text(row, 'source_path'),
    createdAt: date(row, 'created_at'),
    updatedAt: date(row, 'updated_at'),
    ...upscaleOf(row),
    ...rotationOf(row),
    ...keptOrientationOf(row),
  };
}

/** Read from a design's row only; revision rows have no such columns. */
function keptOrientationOf(row: Row): Pick<Design, 'keptOrientation'> {
  const sha256 = row['orientation_kept_sha256'];
  if (sha256 === undefined || sha256 === null) return {};
  return {
    keptOrientation: {
      sha256: text(row, 'orientation_kept_sha256'),
      reason: text(row, 'orientation_kept_reason'),
    },
  };
}

function upscaleOf(row: Row): Pick<Design, 'upscale'> {
  const model = optionalText(row, 'upscale_model');
  return model === null
    ? {}
    : { upscale: { model, originalSha256: text(row, 'upscale_from_sha256') } };
}

function rotationOf(row: Row): Pick<Design, 'rotation'> {
  if (row['rotation'] === null) return {};
  const degrees = integer(row, 'rotation');
  const turn = QUARTER_TURNS.find((each) => each === degrees);
  if (turn === undefined) throw new Error(`Column rotation holds ${String(degrees)}`);
  return {
    rotation: {
      degrees: turn,
      originalSha256: text(row, 'rotation_from_sha256'),
      reason: text(row, 'rotation_reason'),
    },
  };
}

/** Maps a row of a design joined with its concept (`concept_key`, `concept_name`, ...). */
export function toDesignView(row: Row): DesignView {
  return {
    ...toDesign(row),
    concept: {
      id: text(row, 'concept_id') as ConceptId,
      key: text(row, 'concept_key'),
      name: optionalText(row, 'concept_name'),
      createdAt: date(row, 'concept_created_at'),
    },
  };
}

export function toMockup(row: Row): Mockup {
  const look = sceneLook(row);
  return {
    id: text(row, 'id') as MockupId,
    designId: text(row, 'design_id') as DesignId,
    designRevision: integer(row, 'design_revision'),
    variantId: text(row, 'variant_id'),
    printArea: text(row, 'print_area'),
    view: text(row, 'view'),
    scenePrompt: row['scene_prompt'] === null ? null : text(row, 'scene_prompt'),
    ...(look && { sceneLook: look }),
    sceneCheck: sceneCheck(row),
    printConfirmed: integer(row, 'print_confirmed') === 1,
    sourceAsset: row['source_storage_key'] === null ? null : toImageAsset(row, 'source_'),
    asset: toImageAsset(row),
    createdAt: date(row, 'created_at'),
  };
}

/** Read leniently, so a look kept with an option the app no longer has still opens, on Auto. */
function sceneLook(row: Row): SceneLook | null {
  const json = optionalText(row, 'scene_look_json');
  return json === null ? null : sceneLookOf(JSON.parse(json));
}

function sceneCheck(row: Row): SceneCheck | null {
  const json = optionalText(row, 'scene_check_json');
  if (json === null) return null;
  // Checks stored before doubts were kept separately have none.
  const { same, issues, unverifiable = [] } = JSON.parse(json) as Record<string, unknown>;
  if (typeof same !== 'boolean' || !isTextList(issues) || !isTextList(unverifiable)) {
    throw new Error('Column scene_check_json is not a scene check');
  }
  return { same, issues, unverifiable };
}

/** The product details kept with a photo, or `null` while it was not read. */
export function toProductDetails(row: Row): ProductDetails | null {
  const json = optionalText(row, 'product_details_json');
  if (json === null) return null;
  const details = JSON.parse(json) as Record<string, unknown>;
  const { product, material, printPlacement, printHasLettering, printColors, notMistakenFor } =
    details;
  if (
    typeof product !== 'string' ||
    typeof material !== 'string' ||
    typeof printPlacement !== 'string' ||
    typeof printHasLettering !== 'boolean' ||
    !isTextList(printColors) ||
    typeof notMistakenFor !== 'string'
  ) {
    throw new Error('Column product_details_json is not product details');
  }
  return { product, material, printPlacement, printHasLettering, printColors, notMistakenFor };
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function optionalDate(row: Row, column: string): Date | null {
  return row[column] === null ? null : date(row, column);
}

export function toListing(row: Row, products: readonly ListingProductLink[]): Listing {
  const state = text(row, 'state');
  const fit = text(row, 'fit');
  if (!isListingState(state)) {
    throw new Error(`Unknown listing state ${state}`);
  }
  if (!isFitMode(fit)) throw new Error(`Unknown fit ${fit}`);
  return {
    id: text(row, 'id') as ListingId,
    designId: text(row, 'design_id') as DesignId,
    designRevision: integer(row, 'design_revision'),
    marketplaceId: text(row, 'marketplace_id'),
    state,
    printArea: text(row, 'print_area'),
    fit,
    products,
    linkedAt: optionalDate(row, 'linked_at'),
    createdAt: date(row, 'created_at'),
    publishedAt: optionalDate(row, 'published_at'),
  };
}

export function toListingProduct(row: Row): ListingProductLink {
  return {
    sku: text(row, 'sku'),
    productId: text(row, 'product_id'),
    variantId: text(row, 'variant_id'),
  };
}
