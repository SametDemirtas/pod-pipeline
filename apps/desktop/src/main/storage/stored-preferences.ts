import { z } from 'zod';
import {
  AI_PROVIDERS,
  fields as requestFields,
  listingPrice,
  productFacts,
  SCENE_PROVIDERS,
  UI_LANGUAGES,
  UPSCALE_MODELS,
} from '@pod/contracts';
import type { StoredPreferences } from '../application/settings/preferences-store.js';

/** Each field is checked on its own, so one bad value never costs the others. */
const fields = {
  language: z.enum(UI_LANGUAGES),
  importFolders: z.array(z.string().min(1)),
  textProvider: z.enum(AI_PROVIDERS),
  textModel: requestFields.modelId,
  checkModel: requestFields.modelId,
  sceneProvider: z.enum(SCENE_PROVIDERS),
  sceneModel: requestFields.modelId,
  productFacts: z.record(z.string(), productFacts),
  aiDesigns: z.boolean(),
  samsungFromIphone: z.boolean(),
  upscaleModel: z.enum(UPSCALE_MODELS),
  autoUpscale: z.boolean(),
  listingPrices: z.record(z.string(), listingPrice),
  shippingProfiles: z.record(z.string(), requestFields.shopId),
  sizePrices: z.record(z.string(), z.record(z.string(), listingPrice)),
  listingSizes: z.record(z.string(), z.array(requestFields.size).min(1)),
};

/** The preferences in `raw` that still read; anything else is dropped, never guessed. */
export function storedPreferences(raw: unknown): StoredPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const language = fields.language.safeParse(record['language']);
  const importFolders = fields.importFolders.safeParse(record['importFolders']);
  const textProvider = fields.textProvider.safeParse(record['textProvider']);
  const sceneProvider = fields.sceneProvider.safeParse(record['sceneProvider']);
  // Models belong to their service, so they go with a stored service that no longer reads.
  const textModels = textProvider.success || record['textProvider'] === undefined;
  const sceneModels = sceneProvider.success || record['sceneProvider'] === undefined;
  const textModel = fields.textModel.safeParse(record['textModel']);
  const checkModel = fields.checkModel.safeParse(record['checkModel']);
  const sceneModel = fields.sceneModel.safeParse(record['sceneModel']);
  const facts = fields.productFacts.safeParse(record['productFacts']);
  const aiDesigns = fields.aiDesigns.safeParse(record['aiDesigns']);
  const samsung = fields.samsungFromIphone.safeParse(record['samsungFromIphone']);
  const upscaleModel = fields.upscaleModel.safeParse(record['upscaleModel']);
  const autoUpscale = fields.autoUpscale.safeParse(record['autoUpscale']);
  const prices = fields.listingPrices.safeParse(record['listingPrices']);
  const shipping = fields.shippingProfiles.safeParse(record['shippingProfiles']);
  const sizePrices = fields.sizePrices.safeParse(record['sizePrices']);
  const sizes = fields.listingSizes.safeParse(record['listingSizes']);
  return {
    ...(language.success && { language: language.data }),
    ...(importFolders.success && { importFolders: importFolders.data }),
    ...(textProvider.success && { textProvider: textProvider.data }),
    ...(textModels && textModel.success && { textModel: textModel.data }),
    ...(textModels && checkModel.success && { checkModel: checkModel.data }),
    ...(sceneProvider.success && { sceneProvider: sceneProvider.data }),
    ...(sceneModels && sceneModel.success && { sceneModel: sceneModel.data }),
    ...(facts.success && { productFacts: facts.data }),
    ...(aiDesigns.success && { aiDesigns: aiDesigns.data }),
    ...(samsung.success && { samsungFromIphone: samsung.data }),
    ...(upscaleModel.success && { upscaleModel: upscaleModel.data }),
    ...(autoUpscale.success && { autoUpscale: autoUpscale.data }),
    ...(prices.success && { listingPrices: prices.data }),
    ...(shipping.success && { shippingProfiles: shipping.data }),
    ...(sizePrices.success && { sizePrices: sizePrices.data }),
    ...(sizes.success && { listingSizes: sizes.data }),
  };
}
