import { designKeyOf } from '../catalog/keys.js';
import type { ProductFamily, ProductFamilyCatalog } from '../catalog/product-family.js';
import { normalizeLabel } from '../catalog/text-folding.js';
import { compareCodeUnits, compareDesignKeys } from '../ordering.js';
import type { SourceFile } from '../ports/files.js';

export type LayoutSkipReason =
  | 'invalid-path'
  | 'unsupported-extension'
  | 'unknown-family'
  | 'missing-concept-number'
  | 'missing-product-name'
  | 'too-deep'
  | 'duplicate-design-key'
  | 'conflicting-concept-name';

export interface PlannedDesign {
  readonly designKey: string;
  readonly conceptKey: string;
  /** `null` when the file location carries no concept name, e.g. a flat `01 Mug.png`. */
  readonly conceptName: string | null;
  readonly family: ProductFamily;
  readonly file: SourceFile;
  /** Made from the file of the family this one takes its artwork from. */
  readonly borrowed: boolean;
}

export interface LayoutSkippedFile {
  readonly relativePath: string;
  readonly reason: LayoutSkipReason;
}

export interface LayoutResult {
  readonly planned: readonly PlannedDesign[];
  readonly skipped: readonly LayoutSkippedFile[];
}

export interface LayoutOptions {
  /** Families such as Samsung cases are also made from the file of the family they share artwork with. */
  readonly shareArtwork: boolean;
}

/** Turns a list of files into designs, following one folder convention. */
export interface ImportLayout {
  /** Deepest folder level the layout looks at; passed to the scanner. */
  readonly maxDepth: number;
  interpret(files: readonly SourceFile[], options: LayoutOptions): LayoutResult;
}

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
/** 1–3 digits, then a separator or the end: `01. Name`, `7) Name`, `12_Name`, `003`. */
const CONCEPT_FOLDER = /^\s*(\d{1,3})(?!\d)(?:\s*[.)_\-\u2013\u2014]\s*|\s+|$)(.*)$/;
/** A hyphen, en dash or em dash between spaces: `Design - Name`, `Design – Name`. */
const LABEL_SEPARATOR = /\s[-\u2013\u2014]\s/;

/** Words that may precede the concept name, as in `01. Design - Lantern Harbor`. */
const NAME_LABELS: ReadonlySet<string> = new Set([
  'design',
  'concept',
  'tasarim',
  'konsept',
  'entwurf',
  'motiv',
]);

/**
 * Supports two conventions:
 *
 * - One folder per concept, one file per product family:
 *   `01. Lantern Harbor/Mug.png` → design `01-mug` of concept `01` "Lantern Harbor".
 *   A known label before the first spaced dash is dropped, so `01. Design - Tulip` works too,
 *   while `01. Tulip - The Musical` keeps its full name.
 * - Flat files named with concept number and product: `01 Mug.png`, `07-tshirt.jpg`.
 */
export class ConceptFolderLayout implements ImportLayout {
  readonly maxDepth = 1;

  constructor(
    private readonly families: Pick<ProductFamilyCatalog, 'findByFileName' | 'usingArtworkOf'>,
  ) {}

  interpret(files: readonly SourceFile[], options: LayoutOptions): LayoutResult {
    const planned: PlannedDesign[] = [];
    const skipped: LayoutSkippedFile[] = [];

    for (const file of files) {
      const outcome = this.interpretFile(file);
      if ('reason' in outcome) skipped.push(outcome);
      else planned.push(outcome, ...(options.shareArtwork ? this.borrowing(outcome) : []));
    }

    return rejectAmbiguous(planned, skipped);
  }

  private interpretFile(file: SourceFile): PlannedDesign | LayoutSkippedFile {
    const skip = (reason: LayoutSkipReason): LayoutSkippedFile => ({
      relativePath: file.relativePath,
      reason,
    });

    const segments = file.relativePath.normalize('NFC').split('/');
    if (segments.some((segment) => !segment || segment === '..' || segment.includes('\\'))) {
      return skip('invalid-path');
    }

    const fileName = segments.at(-1) ?? '';
    const dot = fileName.lastIndexOf('.');
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';

    if (!SUPPORTED_EXTENSIONS.has(extension)) return skip('unsupported-extension');
    if (segments.length > 2) return skip('too-deep');

    if (segments.length === 1) return this.interpretFlatFile(file, stem, skip);

    const folder = CONCEPT_FOLDER.exec(segments[0] ?? '');
    const conceptKey = folder ? toConceptKey(folder[1] ?? '') : undefined;
    if (!folder || !conceptKey) return skip('missing-concept-number');
    const family = this.families.findByFileName(stem);
    if (!family) return skip('unknown-family');
    return plan(conceptKey, conceptNameFrom(folder[2] ?? ''), family, file);
  }

  /** The designs of families made from the same artwork, e.g. Samsung cases from a phone case. */
  private borrowing(design: PlannedDesign): PlannedDesign[] {
    return this.families.usingArtworkOf(design.family.id).map((family) => ({
      ...plan(design.conceptKey, design.conceptName, family, design.file),
      borrowed: true,
    }));
  }

  private interpretFlatFile(
    file: SourceFile,
    stem: string,
    skip: (reason: LayoutSkipReason) => LayoutSkippedFile,
  ): PlannedDesign | LayoutSkippedFile {
    const digits = /^\s*(\d+)/.exec(stem)?.[1] ?? '';
    const conceptKey = digits.length <= 3 ? toConceptKey(digits) : undefined;
    if (!conceptKey) return skip('missing-concept-number');
    const product = CONCEPT_FOLDER.exec(stem)?.[2]?.trim();
    if (!product) return skip('missing-product-name');
    const family = this.families.findByFileName(product);
    if (!family) return skip('unknown-family');
    return plan(conceptKey, null, family, file);
  }
}

function conceptNameFrom(rest: string): string | null {
  const separator = LABEL_SEPARATOR.exec(rest);
  const hasLabel =
    separator !== null && NAME_LABELS.has(normalizeLabel(rest.slice(0, separator.index)));
  const name = hasLabel ? rest.slice(separator.index + separator[0].length) : rest;
  return name.trim().replace(/\s+/g, ' ') || null;
}

function plan(
  conceptKey: string,
  conceptName: string | null,
  family: ProductFamily,
  file: SourceFile,
): PlannedDesign {
  return {
    designKey: designKeyOf(conceptKey, family.id),
    conceptKey,
    conceptName,
    family,
    file,
    borrowed: false,
  };
}

/** `7`, `07` and `007` all become `07`; zero is not a concept number. */
function toConceptKey(digits: string): string | undefined {
  const number = Number.parseInt(digits, 10);
  return number > 0 ? String(number).padStart(2, '0') : undefined;
}

/** A concept's own file for a family wins over the artwork borrowed for it. */
function withoutOverridden(planned: readonly PlannedDesign[]): PlannedDesign[] {
  const own = new Set(planned.filter((item) => !item.borrowed).map((item) => item.designKey));
  return planned.filter((item) => !item.borrowed || !own.has(item.designKey));
}

function rejectAmbiguous(
  all: readonly PlannedDesign[],
  skipped: readonly LayoutSkippedFile[],
): LayoutResult {
  const planned = withoutOverridden(all);
  const keyCounts = new Map<string, number>();
  const conceptNames = new Map<string, Set<string>>();
  for (const item of planned) {
    keyCounts.set(item.designKey, (keyCounts.get(item.designKey) ?? 0) + 1);
    if (item.conceptName === null) continue;
    const names = conceptNames.get(item.conceptKey) ?? new Set<string>();
    names.add(item.conceptName);
    conceptNames.set(item.conceptKey, names);
  }

  const accepted: PlannedDesign[] = [];
  const rejected = [...skipped];
  for (const item of planned) {
    const { relativePath } = item.file;
    if ((keyCounts.get(item.designKey) ?? 0) > 1) {
      rejected.push({ relativePath, reason: 'duplicate-design-key' });
    } else if ((conceptNames.get(item.conceptKey)?.size ?? 0) > 1) {
      rejected.push({ relativePath, reason: 'conflicting-concept-name' });
    } else {
      accepted.push(item);
    }
  }

  accepted.sort((a, b) => compareDesignKeys(a.designKey, b.designKey));
  // A file several designs are made from is named once for each reason.
  const named = new Map(rejected.map((file) => [`${file.relativePath}\u0000${file.reason}`, file]));
  const unique = [...named.values()];
  unique.sort((a, b) => compareCodeUnits(a.relativePath, b.relativePath));
  return { planned: accepted, skipped: unique };
}
