import { describe, expect, it } from 'vitest';
import { productFamilyId } from '../../catalog/product-family.js';
import { LOOK_FRAGMENTS } from './scene-look-options.js';
import {
  LOOK_CONTROLS,
  LOOK_OPTIONS,
  lookChoicesOf,
  lookLine,
  lookOptionsFor,
  offeredLook,
  sceneLookOf,
  type LookChoices,
} from './scene-look.js';

const LABEL = 'Look (takes precedence over the scene description; everything below still applies):';
/** Long enough for every control at once; short beside the seller's 1000 characters. */
const MAX_LINE_LENGTH = 800;

const EVERY_OPTION = LOOK_CONTROLS.flatMap((control) =>
  LOOK_OPTIONS[control].map((option) => [control, option] as const),
);

describe('lookLine', () => {
  it.each(EVERY_OPTION)('writes %s %s as its own fragment', (control, option) => {
    const fragments: Readonly<Record<string, string>> = LOOK_FRAGMENTS[control];

    expect(lookLine({ [control]: option })).toBe(`${LABEL} ${fragments[option]}.`);
  });

  it('adds nothing while every control is Auto', () => {
    expect(lookLine({})).toBeNull();
    expect(lookLine({ lighting: undefined })).toBeNull();
  });

  it('joins the chosen options in a fixed order, whatever order they were chosen in', () => {
    expect(lookLine({ props: 'bare', shotSize: 'hero', blur: 'soft' })).toBe(
      `${LABEL} ${LOOK_FRAGMENTS.shotSize.hero}; ${LOOK_FRAGMENTS.blur.soft}; no props.`,
    );
  });

  it('stays short with the longest option of every control', () => {
    const longest = Object.fromEntries(
      LOOK_CONTROLS.map((control) => {
        const fragments: Readonly<Record<string, string>> = LOOK_FRAGMENTS[control];
        const [option] = Object.keys(fragments).sort(
          (a, b) => (fragments[b] ?? '').length - (fragments[a] ?? '').length,
        );
        return [control, option];
      }),
    ) as LookChoices;

    expect(lookLine(longest)?.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
  });

  it('keeps the product sharp and the print true whatever the blur and colour grade', () => {
    for (const fragment of Object.values(LOOK_FRAGMENTS.blur)) {
      expect(fragment).toMatch(/product (fully|both) sharp/);
    }
    for (const fragment of Object.values(LOOK_FRAGMENTS.grade)) {
      expect(fragment).toContain('surroundings');
    }
  });

  it('names no lens, camera body, quality tag or art style', () => {
    const all = EVERY_OPTION.map(([control, option]) => lookLine({ [control]: option })).join(' ');

    expect(all).not.toMatch(
      /\b(lens|anamorphic|mm|f\/|8K|4K|award|ultra|cinematic|anime|watercolou?r|oil)\b/i,
    );
  });
});

describe('look options by family', () => {
  const MUG = productFamilyId('mug');
  const SHIRT = productFamilyId('t-shirt');

  it('offers a top-down view only for a product that lies flat', () => {
    expect(lookOptionsFor(SHIRT, {})).toEqual(LOOK_OPTIONS);
    expect(lookOptionsFor(MUG, {})).toEqual({
      ...LOOK_OPTIONS,
      cameraHeight: ['eyeLevel', 'slightlyAbove'],
    });
    expect(lookOptionsFor(productFamilyId('pillow'), {}).cameraHeight).not.toContain('topDown');
  });

  it('sets an option the family is not offered back to Auto and keeps the rest', () => {
    const look = { shape: '3:4', cameraHeight: 'topDown', grade: 'film' } as const;

    expect(offeredLook(SHIRT, look)).toEqual(look);
    expect(offeredLook(MUG, look)).toEqual({ shape: '3:4', grade: 'film' });
    expect(offeredLook(MUG, { cameraHeight: 'eyeLevel' })).toEqual({ cameraHeight: 'eyeLevel' });
  });

  it.each([
    [{ lighting: 'studio', timeOfDay: 'morning' }, { lighting: 'studio' }, 'timeOfDay'],
    [{ lighting: 'moody', timeOfDay: 'blueHour' }, { lighting: 'moody' }, 'timeOfDay'],
    [{ props: 'bare', season: 'winter' }, { props: 'bare' }, 'season'],
    [{ shotSize: 'printCloseUp', props: 'styled' }, { shotSize: 'printCloseUp' }, 'props'],
  ] as const)('lets %j set %j, with no %s offered', (look, kept, dropped) => {
    expect(offeredLook(SHIRT, look)).toEqual(kept);
    expect(lookLine(offeredLook(SHIRT, look))).toBe(lookLine(kept));
    expect(lookOptionsFor(SHIRT, look)[dropped]).toEqual([]);
  });

  it.each([
    { lighting: 'softDaylight', timeOfDay: 'morning' },
    { lighting: 'hardSun', timeOfDay: 'midday' },
    { lighting: 'warmLamp', timeOfDay: 'blueHour' },
    { timeOfDay: 'goldenHour' },
    { props: 'minimal', season: 'spring' },
    { shotSize: 'hero', props: 'bare' },
  ] as const)('keeps %j as chosen', (look) => {
    expect(offeredLook(SHIRT, look)).toEqual(look);
  });

  it('applies the rules in order, so a close-up that drops bare props keeps the season', () => {
    const look = { shotSize: 'printCloseUp', props: 'bare', season: 'autumn' } as const;

    expect(offeredLook(SHIRT, look)).toEqual({ shotSize: 'printCloseUp', season: 'autumn' });
    expect(lookOptionsFor(SHIRT, look).season).toEqual(LOOK_OPTIONS.season);
  });
});

describe('reading looks', () => {
  it('keeps only known options when read leniently', () => {
    expect(
      lookChoicesOf({ lighting: 'studio', blur: 'heavy', grade: 7, auto: 'x', props: 'auto' }),
    ).toEqual({ lighting: 'studio' });
  });

  it.each([
    [{ shape: '1:1' }, { shape: '1:1' }],
    [
      { shape: '3:4', season: 'winter', backdrop: 'contrast' },
      { shape: '3:4', season: 'winter', backdrop: 'contrast' },
    ],
    [{ season: 'winter' }, { shape: '4:3', season: 'winter' }],
    [{ shape: '16:9', lighting: 'neon', lens: 'macro' }, { shape: '4:3' }],
    [null, { shape: '4:3' }],
    ['4:3', { shape: '4:3' }],
  ])('reads the kept look %j as %j', (value, look) => {
    expect(sceneLookOf(value)).toEqual(look);
  });
});
