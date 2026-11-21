import { vi } from 'vitest';
import type { DesktopApi } from '@pod/contracts/client';
import { aiCatalogDto } from '../dtos/app-dtos.js';
import type { FakeState } from './fake-state.js';

/** The model kept after a change: the one asked for, or the default for `null` or a new service. */
const nextModel = (
  requested: string | null | undefined,
  current: string,
  serviceChanged: boolean,
  fallback: string,
) => (requested === undefined && !serviceChanged ? current : (requested ?? fallback));

/** The stored choices by family with the requested ones in place; `null` removes one. */
function byFamily<T>(
  stored: Readonly<Record<string, T>>,
  requested: Readonly<Record<string, T | null>> = {},
): Record<string, T> {
  return Object.fromEntries(
    Object.entries({ ...stored, ...requested }).filter(
      (entry): entry is [string, T] => entry[1] !== null,
    ),
  );
}

/** Settings and what the app offers. */
export function fakeSettingsApi(state: FakeState) {
  return {
    getSettings: vi.fn(() => Promise.resolve(state.settings)),
    getAiCatalog: vi.fn<DesktopApi['getAiCatalog']>(() => Promise.resolve(aiCatalogDto)),
    updateSettings: vi.fn<DesktopApi['updateSettings']>((request) => {
      const textProvider = request.textProvider ?? state.settings.textProvider;
      const sceneProvider = request.sceneProvider ?? state.settings.sceneProvider;
      const text = aiCatalogDto[textProvider].text;
      const textChanged = textProvider !== state.settings.textProvider;
      const sceneChanged = sceneProvider !== state.settings.sceneProvider;
      state.settings = {
        language: request.language ?? state.settings.language,
        textProvider,
        textModel: nextModel(
          request.textModel,
          state.settings.textModel,
          textChanged,
          text.defaultModel,
        ),
        checkModel: nextModel(
          request.checkModel,
          state.settings.checkModel,
          textChanged,
          text.defaultCheckModel,
        ),
        sceneProvider,
        sceneModel: nextModel(
          request.sceneModel,
          state.settings.sceneModel,
          sceneChanged,
          aiCatalogDto[sceneProvider].scenes?.defaultModel ?? '',
        ),
        productFacts: { ...state.settings.productFacts, ...request.productFacts },
        aiDesigns: request.aiDesigns ?? state.settings.aiDesigns,
        samsungFromIphone: request.samsungFromIphone ?? state.settings.samsungFromIphone,
        upscaleModel: request.upscaleModel ?? state.settings.upscaleModel,
        autoUpscale: request.autoUpscale ?? state.settings.autoUpscale,
        listingPrices: byFamily(state.settings.listingPrices, request.listingPrices),
        shippingProfiles: byFamily(state.settings.shippingProfiles, request.shippingProfiles),
        sizePrices: byFamily(state.settings.sizePrices, request.sizePrices),
        listingSizes: {
          blanket: ['50″×60″'],
          ...byFamily(state.settings.listingSizes, request.listingSizes),
        },
      };
      return Promise.resolve(state.settings);
    }),
    getMcpLaunch: vi.fn<DesktopApi['getMcpLaunch']>(() =>
      Promise.resolve({
        command: '/Applications/POD Pipeline.app/Contents/MacOS/POD Pipeline',
        args: ['--mcp-server'],
        env: {},
        outsideApplicationsFolder: false,
      }),
    ),
  };
}
