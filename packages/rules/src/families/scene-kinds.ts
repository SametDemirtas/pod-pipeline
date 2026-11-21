/**
 * Kinds of ready-made scene: product photos in a lived-in setting, marketing
 * shots for ads and shop banners, and shots with a model.
 */
export const SCENE_KINDS = ['product', 'marketing', 'model'] as const;

export type SceneKind = (typeof SCENE_KINDS)[number];
