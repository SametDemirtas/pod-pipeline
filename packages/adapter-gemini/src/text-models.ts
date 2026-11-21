import type { TextModelCatalog } from '@pod/adapter-ai';

/** Text models suggested to the seller; the default writes listings well at a middle price. */
export const GEMINI_TEXT_MODELS: TextModelCatalog = {
  defaultModel: 'gemini-3.8-flash',
  models: [
    { id: 'gemini-4-argon', seesImages: true },
    { id: 'gemini-3.8-flash', seesImages: true },
    { id: 'gemini-3.5-flash-lite', seesImages: true },
  ],
  defaultCheckModel: 'gemini-3.5-flash-lite',
  // Every current Gemini text model reads images, so one the catalog does not list is taken to.
  othersSeeImages: true,
};
