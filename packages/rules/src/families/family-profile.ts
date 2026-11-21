import type { FitModeDto } from '@pod/contracts/client';
import { defaultFamilyValue, type DefaultFamilyId } from './family-ids.js';
import {
  BLANKET_SCENES,
  CANVAS_SCENES,
  HOODIE_SCENES,
  MUG_SCENES,
  PHONE_CASE_SCENES,
  POSTER_SCENES,
  STICKER_SCENES,
  SWEATSHIRT_SCENES,
  T_SHIRT_SCENES,
  TOTE_BAG_SCENES,
  type FamilyPresets,
} from './scene-preset-prompts.js';

/** What a family's variant sizes are: clothing sizes, phone models or plain sizes. */
export type SizeKind = 'clothing' | 'model' | 'size';

/** What the app knows of a product family, for printing, listing and scenes alike. */
export interface FamilyProfile {
  /**
   * How the design goes on the print area unless the seller chooses otherwise:
   * `cover` for a product printed edge to edge, so the design covers the whole
   * area of every size, centred and cropped rather than stretched or bordered.
   */
  readonly fit: FitModeDto;
  readonly sizeKind: SizeKind;
  /**
   * The product hangs or lies either way up, so artwork of the other
   * orientation than the print area may be turned to fill it rather than cropped.
   */
  readonly turnable: boolean;
  /** The product can lie flat, so a scene may show it from above. */
  readonly liesFlat: boolean;
  /**
   * One sentence on how the product behaves as a real object, so the scene
   * model does not bend or melt it.
   */
  readonly physics: string | null;
  /**
   * How the print sits on a soft product a scene may fold, in place of the rule that keeps
   * the print flat; told to keep a print flat, the model pastes it on like a sticker.
   */
  readonly printOnFabric: string | null;
  /**
   * Brands the product is not made for, which its listing must not name: an
   * iPhone case listed as fitting a Samsung would mislead buyers and searches.
   * Model words such as Galaxy, and Apple, are left out: they are also everyday
   * words that designs are named after, a night sky or a fruit.
   */
  readonly otherBrands: readonly string[];
  readonly scenes: FamilyPresets;
}

const GARMENT =
  'The garment is soft fabric that hangs, drapes and folds with gravity around the printed area, which stays smooth.';

const PHONE_CASE =
  'The case is a rigid shell on a phone: its camera and button cut-outs stay where they are in the photo.';

const PLAIN = {
  fit: 'contain',
  sizeKind: 'size',
  turnable: false,
  liesFlat: false,
  printOnFabric: null,
  otherBrands: [],
} as const;

/** The families the app knows, each described once. */
export const FAMILY_PROFILES = {
  'phone-case': {
    ...PLAIN,
    sizeKind: 'model',
    liesFlat: true,
    physics: PHONE_CASE,
    otherBrands: ['Samsung'],
    scenes: PHONE_CASE_SCENES,
  },
  'samsung-case': {
    ...PLAIN,
    sizeKind: 'model',
    liesFlat: true,
    physics: PHONE_CASE,
    otherBrands: ['iPhone'],
    scenes: PHONE_CASE_SCENES,
  },
  mug: {
    ...PLAIN,
    physics:
      'The mug is rigid: its round rim and its handle stay solid, unbent and attached as in the photo.',
    scenes: MUG_SCENES,
  },
  blanket: {
    ...PLAIN,
    fit: 'cover',
    turnable: true,
    liesFlat: true,
    physics: 'The blanket is soft, heavy fabric that drapes and folds under its own weight.',
    printOnFabric:
      '- The blanket may be laid, hung, folded, draped or wrapped only as the scene says; its printed side faces the camera and most of the artwork stays visible. The print is dyed into the fleece, not a sticker on top: it bends with the fabric over every fold and ripple, takes the same light, shading and shadows as the fabric around it, looks matte with slightly soft edges, and the plush fleece texture shows across the printed area too. Folds may shade the print but never redraw, cut or replace it.',
    scenes: BLANKET_SCENES,
  },
  't-shirt': {
    ...PLAIN,
    sizeKind: 'clothing',
    liesFlat: true,
    physics: GARMENT,
    scenes: T_SHIRT_SCENES,
  },
  sweatshirt: {
    ...PLAIN,
    sizeKind: 'clothing',
    liesFlat: true,
    physics: GARMENT,
    scenes: SWEATSHIRT_SCENES,
  },
  hoodie: {
    ...PLAIN,
    sizeKind: 'clothing',
    liesFlat: true,
    physics: `${GARMENT} Its hood, drawstrings and pocket stay as in the photo.`,
    scenes: HOODIE_SCENES,
  },
  poster: {
    ...PLAIN,
    liesFlat: true,
    physics:
      'The poster is thin flat paper: it lies flush against the wall or surface, with straight edges and square corners.',
    scenes: POSTER_SCENES,
  },
  canvas: {
    ...PLAIN,
    physics:
      'The canvas is stretched over a rigid wooden frame: its face stays flat, its corners square and its depth as in the photo.',
    scenes: CANVAS_SCENES,
  },
  'tote-bag': {
    ...PLAIN,
    liesFlat: true,
    physics:
      'The tote bag is soft canvas: both straps stay whole and sewn to its top edge, and it hangs with gravity.',
    scenes: TOTE_BAG_SCENES,
  },
  sticker: {
    ...PLAIN,
    liesFlat: true,
    physics:
      'The sticker is thin vinyl: it lies flat on the surface or backing sheet it is on, with cleanly cut edges.',
    scenes: STICKER_SCENES,
  },
} as const satisfies Record<DefaultFamilyId, FamilyProfile>;

/** A family the seller added has no scenes of its own. */
const OTHER_FAMILY: FamilyProfile = { ...PLAIN, physics: null, scenes: {} };

/** The family's profile; a plain one for a family the seller added. */
export function familyProfileOf(familyId: string): FamilyProfile {
  return defaultFamilyValue<FamilyProfile>(FAMILY_PROFILES, familyId) ?? OTHER_FAMILY;
}
