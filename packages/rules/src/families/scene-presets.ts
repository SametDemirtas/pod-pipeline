import { familyProfileOf, type FAMILY_PROFILES } from './family-profile.js';
import { SCENE_KINDS, type SceneKind } from './scene-kinds.js';

type Profiles = typeof FAMILY_PROFILES;

type ScenePresetName = {
  [Family in keyof Profiles]: {
    [Kind in keyof Profiles[Family]['scenes']]: keyof Profiles[Family]['scenes'][Kind];
  }[keyof Profiles[Family]['scenes']];
}[keyof Profiles];

/** The kinds of scene the family has presets of; none for a family the app has no scenes for. */
export function sceneKindsFor(familyId: string): SceneKind[] {
  const { scenes } = familyProfileOf(familyId);
  return SCENE_KINDS.filter((kind) => Object.hasOwn(scenes, kind));
}

/** The family's presets of one kind, by name. */
export function presetsFor(familyId: string, kind: SceneKind): [ScenePresetName, string][] {
  return Object.entries(familyProfileOf(familyId).scenes[kind] ?? {}) as [
    ScenePresetName,
    string,
  ][];
}
