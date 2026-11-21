/** Shapes a scene photo can be made in, width to height; 4:3 is how Etsy shows listing photos. */
export const SCENE_SHAPES = ['4:3', '1:1', '3:4'] as const;
export type SceneShapeDto = (typeof SCENE_SHAPES)[number];

/** The options of each look control, in the order the window shows them. */
export const SCENE_LOOK_OPTIONS = {
  shotSize: ['hero', 'standard', 'roomView', 'printCloseUp'],
  cameraHeight: ['eyeLevel', 'slightlyAbove', 'topDown'],
  lighting: ['softDaylight', 'studio', 'warmLamp', 'hardSun', 'moody'],
  timeOfDay: ['morning', 'midday', 'goldenHour', 'blueHour'],
  season: ['spring', 'summer', 'autumn', 'winter'],
  backdrop: ['fromPrint', 'neutral', 'contrast'],
  blur: ['strong', 'soft', 'none'],
  grade: ['cleanBright', 'warm', 'cool', 'film'],
  props: ['bare', 'minimal', 'styled'],
} as const;

export type SceneLookControl = keyof typeof SCENE_LOOK_OPTIONS;
export type SceneLookOption<C extends SceneLookControl> = (typeof SCENE_LOOK_OPTIONS)[C][number];

/** The chosen look options; a control left out is Auto and adds nothing to the prompt. */
export type SceneLookChoicesDto = {
  readonly [C in SceneLookControl]?: SceneLookOption<C> | undefined;
};

/** How a scene is made: its shape, sent to the image service, and the chosen look options. */
export type SceneLookDto = SceneLookChoicesDto & { readonly shape: SceneShapeDto };

/** What a look adds to the scene prompt, and the options offered for the product. */
export interface SceneLookPreviewDto {
  /** The line added after the seller's scene; `null` while every control is Auto. */
  readonly line: string | null;
  /** A top-down view, for one, is offered only for a product that can lie flat. */
  readonly options: { readonly [C in SceneLookControl]: readonly SceneLookOption<C>[] };
}
