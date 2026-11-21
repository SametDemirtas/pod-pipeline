import type { JsonModel, ModelChoice } from '@pod/adapter-ai';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { TEXT_ADAPTERS, type AiService } from './ai-adapters.js';
import type { SharedParts } from '../shared-parts.js';

/** The settings that name a language model: one writes text, one checks scenes. */
type ModelSetting = 'textModel' | 'checkModel';

/** A choice made in the settings, which may change between requests. */
export interface ChosenService {
  /** The chosen service's name, for errors raised outside its adapter. */
  readonly service: () => Promise<AiService>;
}

/**
 * The language model chosen under `setting`, of the text service chosen in the
 * settings, with the seller's own key. Both are looked up for each request, so
 * a change in the settings applies at once.
 */
export function languageModels(
  parts: Pick<SharedParts, 'secrets' | 'fetch'>,
  settings: Pick<SettingsStore, 'get'>,
  setting: ModelSetting,
): ModelChoice & ChosenService {
  return {
    current: async (): Promise<JsonModel> => {
      const chosen = await settings.get();
      const provider = chosen.textProvider;
      return TEXT_ADAPTERS[provider]
        .choice({
          apiKey: async () => (await parts.secrets.ai[provider].get())?.apiKey,
          model: () => Promise.resolve(chosen[setting]),
          fetch: parts.fetch,
        })
        .current();
    },
    service: async () => TEXT_ADAPTERS[(await settings.get()).textProvider].service,
  };
}
