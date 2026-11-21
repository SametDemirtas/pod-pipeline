import type { UpscaleModelDto } from './catalog-dto.js';

export const UI_LANGUAGES = ['en', 'tr', 'de'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** The AI services the seller may save an API key for; each one writes listing text. */
export const AI_PROVIDERS = ['anthropic', 'openai', 'deepseek', 'kimi', 'gemini'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
/** The AI services that also make scene photos. */
export const SCENE_PROVIDERS = ['gemini', 'openai'] as const satisfies readonly AiProvider[];
export type SceneProvider = (typeof SCENE_PROVIDERS)[number];

export interface AiModelDto {
  readonly id: string;
  readonly seesImages: boolean;
}

/** The models suggested for one use, best first, and the one preselected. */
export interface AiModelsDto {
  readonly defaultModel: string;
  readonly models: readonly AiModelDto[];
}

export interface TextModelsDto extends AiModelsDto {
  /** The cheapest suggested model that reads images, preselected for checking scenes. */
  readonly defaultCheckModel: string;
  /** Whether a model id the seller types in, one not suggested, reads images. */
  readonly othersSeeImages: boolean;
}

export interface AiProviderDto {
  /** The name the seller knows the service by, e.g. `ChatGPT`. */
  readonly service: string;
  readonly text: TextModelsDto;
  /** `null` when the service makes no scene photos. */
  readonly scenes: AiModelsDto | null;
}

/** What each AI service can do and which of its models are suggested. */
export type AiCatalogDto = Readonly<Record<AiProvider, AiProviderDto>>;

/** What the seller states about a product; listing text claims nothing else. Empty when unknown. */
export interface ProductFactsDto {
  readonly material: string;
  readonly care: string;
  readonly fit: string;
  readonly size: string;
}

export interface SettingsDto {
  readonly language: UiLanguage;
  /** The service that writes and translates listing text and looks at photos. */
  readonly textProvider: AiProvider;
  /** The model of `textProvider` that writes and translates listing text. */
  readonly textModel: string;
  /** The model of `textProvider` that compares each scene with the photo it was made from. */
  readonly checkModel: string;
  /** The service that makes scene photos. */
  readonly sceneProvider: SceneProvider;
  /** The model of `sceneProvider` that makes scenes. */
  readonly sceneModel: string;
  /** By product family id, e.g. `mug`. */
  readonly productFacts: Readonly<Record<string, ProductFactsDto>>;
  /** The seller makes designs with AI tools, so every listing says so. */
  readonly aiDesigns: boolean;
  /** Importing a phone case file also makes a Samsung case from it, unless a concept has its own. */
  readonly samsungFromIphone: boolean;
  /** The model that makes artwork larger on this computer. */
  readonly upscaleModel: UpscaleModelDto;
  /** Preparing listings makes low-resolution artwork larger unless the seller unticks it. */
  readonly autoUpscale: boolean;
  /** What prepared listings cost, by product family id; only families the seller priced. */
  readonly listingPrices: Readonly<Record<string, ListingPriceDto>>;
  /** Prices of single sizes, e.g. a larger blanket, by family id and size; others take the family's. */
  readonly sizePrices: Readonly<Record<string, Readonly<Record<string, ListingPriceDto>>>>;
  /** The sizes prepared listings sell, by family id; families not listed sell every size. */
  readonly listingSizes: Readonly<Record<string, readonly string[]>>;
  /**
   * The Etsy shipping profile prepared listings use, by product family id;
   * families without one use the shop's first.
   */
  readonly shippingProfiles: Readonly<Record<string, string>>;
}

/** A price in the minor unit of the shop currency it was set in, e.g. 2499 USD. */
export interface ListingPriceDto {
  readonly amount: number;
  readonly currency: string;
}

export const FILE_HOST_KINDS = ['dropbox', 's3'] as const;
export type FileHostKind = (typeof FILE_HOST_KINDS)[number];

/**
 * Why the fulfilment store cannot take the marketplace shop's listings: it syncs with
 * no marketplace shop, e.g. a store for manual orders, or it looks like it syncs with another one.
 */
export type FulfilmentStoreProblem = 'not-marketplace' | 'other-shop';

/** What is connected; secrets never leave the main process. */
export interface ConnectionsDto {
  readonly printful: {
    readonly storeName: string;
    /** Left out when the store looks right, or when Printful did not say what kind it is. */
    readonly storeProblem?: FulfilmentStoreProblem | undefined;
  } | null;
  readonly fileHost: FileHostKind | null;
  readonly etsy: { readonly shopName: string } | null;
  /** Whether an API key is saved, by AI service. */
  readonly ai: Readonly<Record<AiProvider, boolean>>;
  readonly pinterest: { readonly username: string } | null;
  /**
   * Services whose renewed sign-in could not be saved; they may need
   * connecting again once the app restarts. Left out when there are none.
   */
  readonly reconnect?: readonly SignInService[] | undefined;
}

/** Services the seller signs in to in the browser, whose sign-in the app renews. */
export const SIGN_IN_SERVICES = ['etsy', 'pinterest'] as const;
export type SignInService = (typeof SIGN_IN_SERVICES)[number];

/** How an MCP client starts the app's MCP server: with the app's own runtime, no Node needed. */
export interface McpLaunchDto {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** macOS only: the app runs from outside Applications, so `command` may stop working. */
  readonly outsideApplicationsFolder: boolean;
}

export interface DropboxAuthorizationDto {
  /** Page where the user allows access and receives a code to paste back. */
  readonly authorizeUrl: string;
}
