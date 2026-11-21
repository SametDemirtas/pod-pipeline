import type {
  AiProvider,
  ListingPriceDto,
  ProductFactsDto,
  SceneProvider,
  UiLanguage,
  UpscaleModelDto,
} from '@pod/contracts';

export interface StoredPreferences {
  readonly language?: UiLanguage | undefined;
  readonly importFolders?: readonly string[] | undefined;
  readonly textProvider?: AiProvider | undefined;
  /** Models only when the seller chose another one than the service's default. */
  readonly textModel?: string | undefined;
  readonly checkModel?: string | undefined;
  readonly sceneProvider?: SceneProvider | undefined;
  readonly sceneModel?: string | undefined;
  /** Only the families the seller changed, by family id. */
  readonly productFacts?: Readonly<Record<string, ProductFactsDto>> | undefined;
  readonly aiDesigns?: boolean | undefined;
  readonly samsungFromIphone?: boolean | undefined;
  readonly upscaleModel?: UpscaleModelDto | undefined;
  readonly autoUpscale?: boolean | undefined;
  /** Only the families the seller priced, by family id. */
  readonly listingPrices?: Readonly<Record<string, ListingPriceDto>> | undefined;
  /** Only the families the seller chose a shipping profile for, by family id. */
  readonly shippingProfiles?: Readonly<Record<string, string>> | undefined;
  /** Only the families the seller priced by size, by family id and size. */
  readonly sizePrices?:
    Readonly<Record<string, Readonly<Record<string, ListingPriceDto>>>> | undefined;
  /** Only the families whose sizes the seller chose, by family id. */
  readonly listingSizes?: Readonly<Record<string, readonly string[]>> | undefined;
}

/** What the settings and the folder policy need from the stored preferences. */
export interface PreferencesStore {
  read(): Promise<StoredPreferences>;
  /** Applies one change at a time, each to what the one before it stored. */
  change(update: (current: StoredPreferences) => StoredPreferences): Promise<StoredPreferences>;
}
