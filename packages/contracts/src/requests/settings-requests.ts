import { z } from 'zod';
import {
  AI_PROVIDERS,
  SCENE_PROVIDERS,
  SIGN_IN_SERVICES,
  UI_LANGUAGES,
  UPSCALE_MODELS,
  type SignInService,
} from '../dto.js';
import { fields } from '../fields.js';
import { MAX_CREDENTIAL_LENGTH, MAX_LISTED_SIZES } from '../field-limits.js';
import { MAX_PRODUCT_FACT_LENGTH } from '../limits.js';

const fact = z.string().max(MAX_PRODUCT_FACT_LENGTH);
export const productFacts = z
  .object({ material: fact, care: fact, fit: fact, size: fact })
  .strict();

export const listingPrice = z.object({ amount: fields.price, currency: fields.currency }).strict();

export const updateSettingsRequest = z
  .object({
    language: z.enum(UI_LANGUAGES).optional(),
    /** Choosing another service goes back to its default models. */
    textProvider: z.enum(AI_PROVIDERS).optional(),
    /** For each model, `null` goes back to the default of its service. */
    textModel: fields.modelId.nullable().optional(),
    checkModel: fields.modelId.nullable().optional(),
    sceneProvider: z.enum(SCENE_PROVIDERS).optional(),
    sceneModel: fields.modelId.nullable().optional(),
    /** Replaces the facts of the families given and keeps the others. */
    productFacts: z.record(fields.familyId, productFacts).optional(),
    aiDesigns: z.boolean().optional(),
    samsungFromIphone: z.boolean().optional(),
    upscaleModel: z.enum(UPSCALE_MODELS).optional(),
    autoUpscale: z.boolean().optional(),
    /** Replaces the prices of the families given and keeps the others; `null` removes one. */
    listingPrices: z.record(fields.familyId, listingPrice.nullable()).optional(),
    /** Replaces the prices by size of the families given; `null` removes a family's. */
    sizePrices: z
      .record(fields.familyId, z.record(fields.size, listingPrice).nullable())
      .optional(),
    /** Replaces the sizes listed of the families given; `null` goes back to the default. */
    listingSizes: z
      .record(fields.familyId, z.array(fields.size).min(1).max(MAX_LISTED_SIZES).nullable())
      .optional(),
    /** Replaces the shipping profiles of the families given; `null` goes back to the first. */
    shippingProfiles: z.record(fields.familyId, fields.shopId.nullable()).optional(),
  })
  .strict();
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequest>;

const credential = z.string().trim().min(1).max(MAX_CREDENTIAL_LENGTH);

export const connectPrintfulRequest = z.object({ token: credential }).strict();
export type ConnectPrintfulRequest = z.infer<typeof connectPrintfulRequest>;

export const startDropboxRequest = z.object({ appKey: credential }).strict();
export type StartDropboxRequest = z.infer<typeof startDropboxRequest>;

export const finishDropboxRequest = z.object({ code: credential }).strict();
export type FinishDropboxRequest = z.infer<typeof finishDropboxRequest>;

export const connectS3Request = z
  .object({
    endpoint: z
      .string()
      .trim()
      .max(MAX_CREDENTIAL_LENGTH)
      .pipe(z.url({ protocol: /^https$/ })),
    region: credential.default('auto'),
    bucket: credential,
    accessKeyId: credential,
    secretAccessKey: credential,
  })
  .strict()
  // Only Cloudflare R2 takes "auto"; other stores sign with their real region, e.g. us-east-1.
  .refine(
    ({ endpoint, region }) =>
      region !== 'auto' || /^https:\/\/[^/]+\.r2\.cloudflarestorage\.com(\/|$)/.test(endpoint),
    { path: ['region'], message: 'Enter the region of this store, e.g. us-east-1' },
  );
export type ConnectS3Request = z.input<typeof connectS3Request>;

export const connectAiRequest = z
  .object({ provider: z.enum(AI_PROVIDERS), apiKey: credential })
  .strict();
export type ConnectAiRequest = z.infer<typeof connectAiRequest>;

/** The seller's own app on a service they sign in to in the browser, by service. */
export const connectSignInRequest = z.discriminatedUnion('service', [
  z
    .object({ service: z.literal('etsy'), keystring: credential, sharedSecret: credential })
    .strict(),
  z
    .object({
      service: z.literal('pinterest'),
      appId: z.string().trim().regex(/^\d+$/).max(MAX_CREDENTIAL_LENGTH),
      appSecret: credential,
    })
    .strict(),
]);
export type ConnectSignInRequest = z.infer<typeof connectSignInRequest>;
/** What the seller enters to sign in on one service. */
export type SignInAppRequest<S extends SignInService> = Omit<
  Extract<ConnectSignInRequest, { service: S }>,
  'service'
>;

export const cancelSignInRequest = z.object({ service: z.enum(SIGN_IN_SERVICES) }).strict();
export type CancelSignInRequest = z.infer<typeof cancelSignInRequest>;

export const disconnectRequest = z
  .object({
    service: z.enum(['printful', 'fileHost', ...SIGN_IN_SERVICES, ...AI_PROVIDERS]),
  })
  .strict();
export type DisconnectRequest = z.infer<typeof disconnectRequest>;
