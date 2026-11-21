import type { ModelCatalog } from '@pod/adapter-ai';
import {
  AI_PROVIDERS,
  type AiCatalogDto,
  type AiModelsDto,
  type AiProvider,
  type AiProviderDto,
} from '@pod/contracts';
import type { SettingsDefaults } from '../../application/settings/settings-store.js';
import {
  DEFAULT_SCENE_PROVIDER,
  DEFAULT_TEXT_PROVIDER,
  SCENE_ADAPTERS,
  TEXT_ADAPTERS,
} from './ai-adapters.js';

function modelsDto({ defaultModel, models }: ModelCatalog): AiModelsDto {
  return { defaultModel, models: models.map(({ id, seesImages }) => ({ id, seesImages })) };
}

function providerDto(provider: AiProvider): AiProviderDto {
  const { service, models } = TEXT_ADAPTERS[provider];
  const scenes: Partial<Record<AiProvider, { models: ModelCatalog }>> = SCENE_ADAPTERS;
  const sceneModels = scenes[provider]?.models;
  return {
    service,
    text: {
      ...modelsDto(models),
      defaultCheckModel: models.defaultCheckModel,
      othersSeeImages: models.othersSeeImages,
    },
    scenes: sceneModels ? modelsDto(sceneModels) : null,
  };
}

/** What each AI service can do and its suggested models, as the adapters list them. */
export function aiCatalog(): AiCatalogDto {
  return Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, providerDto(provider)]),
  ) as Record<AiProvider, AiProviderDto>;
}

/** The services and models settings read as until the seller chooses others. */
export const AI_DEFAULTS: Omit<SettingsDefaults, 'language' | 'productFacts' | 'listingSizes'> = {
  textProvider: DEFAULT_TEXT_PROVIDER,
  sceneProvider: DEFAULT_SCENE_PROVIDER,
  textModels: (provider) => {
    const { models } = TEXT_ADAPTERS[provider];
    return { textModel: models.defaultModel, checkModel: models.defaultCheckModel };
  },
  sceneModel: (provider) => SCENE_ADAPTERS[provider].models.defaultModel,
};
