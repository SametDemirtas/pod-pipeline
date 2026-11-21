import { familyProfileOf } from '@pod/rules';
import type { ProductFamilyId } from '../../catalog/product-family.js';
import { LOOK_FRAGMENTS } from './scene-look-options.js';

/** Shapes a scene photo is made in, width to height; Etsy shows listing photos at 4:3. */
export const SCENE_SHAPES = ['4:3', '1:1', '3:4'] as const;
export type SceneShape = (typeof SCENE_SHAPES)[number];

export type LookControl = keyof typeof LOOK_FRAGMENTS;
export type LookOption<C extends LookControl> = keyof (typeof LOOK_FRAGMENTS)[C];

/** The options the seller chose; a control left out is Auto and adds nothing. */
export type LookChoices = { readonly [C in LookControl]?: LookOption<C> | undefined };

/** How a scene is made: its shape, which the image service is asked for, and the chosen options. */
export type SceneLook = LookChoices & { readonly shape: SceneShape };

export type LookOptions = { readonly [C in LookControl]: readonly LookOption<C>[] };

export const LOOK_CONTROLS = Object.keys(LOOK_FRAGMENTS) as LookControl[];

/** Every option of each control. */
export const LOOK_OPTIONS = byControl((control): readonly string[] =>
  Object.keys(LOOK_FRAGMENTS[control]),
) as LookOptions;

const FRAGMENTS: Readonly<Record<LookControl, Readonly<Record<string, string>>>> = LOOK_FRAGMENTS;

/**
 * Choices that make another one meaningless, which then goes back to Auto,
 * applied in this order: a print close-up has no room for props, a scene
 * without props has no seasonal ones, and studio or low-key light shows no
 * time of day.
 */
const OVERRULES: readonly {
  readonly control: LookControl;
  readonly options: readonly string[];
  readonly drops: LookControl;
}[] = [
  { control: 'shotSize', options: ['printCloseUp'], drops: 'props' },
  { control: 'props', options: ['bare'], drops: 'season' },
  { control: 'lighting', options: ['studio', 'moody'], drops: 'timeOfDay' },
];

const LOOK_LABEL =
  'Look (takes precedence over the scene description; everything below still applies):';

/**
 * The options offered for a family's product alongside `look`: a top-down view
 * only when it lies flat, and none for a control the look's other choices overrule.
 */
export function lookOptionsFor(familyId: ProductFamilyId, look: LookChoices): LookOptions {
  const offered = offeredLook(familyId, look);
  return byControl((control): readonly string[] =>
    OVERRULES.some((rule) => rule.drops === control && overrules(rule, offered))
      ? []
      : LOOK_OPTIONS[control].filter((option) => suits(familyId, control, option)),
  ) as LookOptions;
}

/**
 * The look with every option the family is not offered, or that another choice
 * overrules, set back to Auto.
 */
export function offeredLook<T extends LookChoices>(familyId: ProductFamilyId, look: T): T {
  const suited = Object.fromEntries(
    Object.entries(look).filter(
      ([control, option]) => !isControl(control) || suits(familyId, control, option),
    ),
  ) as T;
  return OVERRULES.reduce<T>(
    (current, rule) =>
      overrules(rule, current) ? { ...current, [rule.drops]: undefined } : current,
    suited,
  );
}

/** The chosen options as one labelled line for the scene prompt; `null` when all are Auto. */
export function lookLine(look: LookChoices): string | null {
  const fragments = LOOK_CONTROLS.flatMap((control) => {
    const option = look[control];
    const fragment = option && FRAGMENTS[control][option];
    return fragment ? [fragment] : [];
  });
  return fragments.length > 0 ? `${LOOK_LABEL} ${fragments.join('; ')}.` : null;
}

/** The known options in `value`, read leniently: anything else is left at Auto. */
export function lookChoicesOf(value: Readonly<Record<string, unknown>>): LookChoices {
  return Object.fromEntries(
    LOOK_CONTROLS.flatMap((control) => {
      const option = value[control];
      return isOptionOf(control, option) ? [[control, option]] : [];
    }),
  );
}

/** A kept look, read leniently: an unknown shape is read as 4:3 and unknown options as Auto. */
export function sceneLookOf(value: unknown): SceneLook {
  const fields =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const shape = SCENE_SHAPES.find((candidate) => candidate === fields['shape']) ?? '4:3';
  return { ...lookChoicesOf(fields), shape };
}

function byControl<T>(value: (control: LookControl) => T): Readonly<Record<LookControl, T>> {
  return Object.fromEntries(LOOK_CONTROLS.map((control) => [control, value(control)])) as Record<
    LookControl,
    T
  >;
}

function isControl(key: string): key is LookControl {
  return Object.hasOwn(FRAGMENTS, key);
}

function isOptionOf(control: LookControl, option: unknown): boolean {
  return typeof option === 'string' && Object.hasOwn(FRAGMENTS[control], option);
}

function suits(familyId: ProductFamilyId, control: LookControl, option: unknown): boolean {
  return control !== 'cameraHeight' || option !== 'topDown' || familyProfileOf(familyId).liesFlat;
}

function overrules(rule: (typeof OVERRULES)[number], look: LookChoices): boolean {
  const option = look[rule.control];
  return option !== undefined && rule.options.includes(option);
}
