import type { SceneGenerator } from '@pod/core';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { SCENE_ADAPTERS } from './ai-adapters.js';
import type { ChosenService } from './language-models.js';
import type { SharedParts } from '../shared-parts.js';

/** Scene photos from the image service chosen in the settings, looked up for each scene. */
export function sceneGenerator(
  parts: Pick<SharedParts, 'secrets' | 'fetch' | 'writeTemporary'>,
  settings: Pick<SettingsStore, 'get'>,
): SceneGenerator & ChosenService {
  return {
    generate: async (request) => {
      const chosen = await settings.get();
      const provider = chosen.sceneProvider;
      return SCENE_ADAPTERS[provider]
        .generator({
          apiKey: async () => (await parts.secrets.ai[provider].get())?.apiKey,
          model: () => Promise.resolve(chosen.sceneModel),
          fetch: parts.fetch,
          writeTemporary: parts.writeTemporary,
        })
        .generate(request);
    },
    service: async () => SCENE_ADAPTERS[(await settings.get()).sceneProvider].service,
  };
}
