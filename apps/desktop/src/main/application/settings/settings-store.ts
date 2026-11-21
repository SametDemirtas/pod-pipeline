import {
  UI_LANGUAGES,
  type AiProvider,
  type ProductFactsDto,
  type SceneProvider,
  type SettingsDto,
  type UiLanguage,
  type UpdateSettingsRequest,
} from '@pod/contracts';
import type { PreferencesStore, StoredPreferences } from './preferences-store.js';

/** Picks the first supported language from the system's preferred locales. */
export function pickLanguage(locales: readonly string[]): UiLanguage {
  for (const locale of locales) {
    const language = locale.toLowerCase().split(/[-_]/)[0];
    const match = UI_LANGUAGES.find((supported) => supported === language);
    if (match) return match;
  }
  return 'en';
}

/** What a setting the seller never changed reads as. */
export interface SettingsDefaults {
  readonly language: UiLanguage;
  readonly textProvider: AiProvider;
  readonly sceneProvider: SceneProvider;
  readonly productFacts: Readonly<Record<string, ProductFactsDto>>;
  /** The sizes listings of a family sell until the seller chooses, e.g. one blanket size. */
  readonly listingSizes: Readonly<Record<string, readonly string[]>>;
  /** The models preselected for each service. */
  readonly textModels: (provider: AiProvider) => Pick<SettingsDto, 'textModel' | 'checkModel'>;
  readonly sceneModel: (provider: SceneProvider) => string;
}

/**
 * The model to store: the one requested, none for `null` or a new service,
 * which then reads as that service's default, or else the one stored.
 */
function nextModel(
  requested: string | null | undefined,
  stored: string | undefined,
  serviceChanged: boolean,
): string | undefined {
  if (requested !== undefined) return requested ?? undefined;
  return serviceChanged ? undefined : stored;
}

/** The stored choices by family with those requested in place; `null` removes a family's. */
function byFamily<T>(
  stored: Readonly<Record<string, T>> = {},
  requested: Readonly<Record<string, T | null>>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries({ ...stored, ...requested }).filter(
      (entry): entry is [string, T] => entry[1] !== null,
    ),
  );
}

/** The user-facing settings, stored in the preferences file. */
export class SettingsStore {
  constructor(
    private readonly file: PreferencesStore,
    private readonly defaults: SettingsDefaults,
  ) {}

  async get(): Promise<SettingsDto> {
    return this.toSettings(await this.file.read());
  }

  async update(request: UpdateSettingsRequest): Promise<SettingsDto> {
    const stored = await this.file.change((current) => {
      const { textProvider, sceneProvider } = this.toSettings(current);
      const textChanged = (request.textProvider ?? textProvider) !== textProvider;
      const sceneChanged = (request.sceneProvider ?? sceneProvider) !== sceneProvider;
      return {
        ...current,
        language: request.language ?? current.language,
        textProvider: request.textProvider ?? current.textProvider,
        textModel: nextModel(request.textModel, current.textModel, textChanged),
        checkModel: nextModel(request.checkModel, current.checkModel, textChanged),
        sceneProvider: request.sceneProvider ?? current.sceneProvider,
        sceneModel: nextModel(request.sceneModel, current.sceneModel, sceneChanged),
        ...(request.productFacts && {
          productFacts: { ...current.productFacts, ...request.productFacts },
        }),
        aiDesigns: request.aiDesigns ?? current.aiDesigns,
        samsungFromIphone: request.samsungFromIphone ?? current.samsungFromIphone,
        upscaleModel: request.upscaleModel ?? current.upscaleModel,
        autoUpscale: request.autoUpscale ?? current.autoUpscale,
        ...(request.listingPrices && {
          listingPrices: byFamily(current.listingPrices, request.listingPrices),
        }),
        ...(request.shippingProfiles && {
          shippingProfiles: byFamily(current.shippingProfiles, request.shippingProfiles),
        }),
        ...(request.sizePrices && {
          sizePrices: byFamily(current.sizePrices, request.sizePrices),
        }),
        ...(request.listingSizes && {
          listingSizes: byFamily(current.listingSizes, request.listingSizes),
        }),
      };
    });
    return this.toSettings(stored);
  }

  private toSettings(stored: StoredPreferences): SettingsDto {
    const textProvider = stored.textProvider ?? this.defaults.textProvider;
    const sceneProvider = stored.sceneProvider ?? this.defaults.sceneProvider;
    const textModels = this.defaults.textModels(textProvider);
    return {
      language: stored.language ?? this.defaults.language,
      textProvider,
      textModel: stored.textModel ?? textModels.textModel,
      checkModel: stored.checkModel ?? textModels.checkModel,
      sceneProvider,
      sceneModel: stored.sceneModel ?? this.defaults.sceneModel(sceneProvider),
      // Every family the app knows, with the defaults for those never changed.
      productFacts: Object.fromEntries(
        Object.entries(this.defaults.productFacts).map(([familyId, facts]) => [
          familyId,
          stored.productFacts?.[familyId] ?? facts,
        ]),
      ),
      aiDesigns: stored.aiDesigns ?? false,
      samsungFromIphone: stored.samsungFromIphone ?? true,
      upscaleModel: stored.upscaleModel ?? 'illustration',
      autoUpscale: stored.autoUpscale ?? false,
      listingPrices: stored.listingPrices ?? {},
      shippingProfiles: stored.shippingProfiles ?? {},
      sizePrices: stored.sizePrices ?? {},
      listingSizes: { ...this.defaults.listingSizes, ...stored.listingSizes },
    };
  }
}
