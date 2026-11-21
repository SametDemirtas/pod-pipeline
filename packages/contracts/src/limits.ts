/** Page size used when a client does not ask for one. */
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

/** Longest search text, counted in characters rather than UTF-16 code units. */
export const MAX_SEARCH_CHARACTERS = 100;

/** Largest image accepted on import, by its longest side and by its pixel count. */
export const IMPORT_IMAGE_LIMITS = { side: 30_000, pixels: 150_000_000 } as const;

/** Largest keyword file the app imports. */
export const MAX_KEYWORD_FILE_BYTES = 2 * 1024 * 1024;
/** Keywords a list keeps; a longer file keeps its first ones. */
export const MAX_LIST_KEYWORDS = 5_000;
export const MAX_SCENE_PROMPT_LENGTH = 1000;
/**
 * Largest photo a scene may take its style from; as base64 it stays under
 * Claude's 5 MB limit for one image.
 */
export const MAX_REFERENCE_IMAGE_BYTES = 3_750_000;
/** Claude refuses images with a longer side. */
export const MAX_REFERENCE_IMAGE_SIDE = 8000;
/** A model id the seller may enter instead of a suggested one, e.g. `gemini-nano-banana-2.1`. */
export const MAX_MODEL_ID_LENGTH = 100;
/** Lower-case letters, digits, dots and dashes, as the AI services name their models. */
export const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;
export const MAX_RESEARCH_QUERY_LENGTH = 100;
/** What the seller may give the language model to write a listing from. */
export const LISTING_WRITER_LIMITS = { keywords: 20, notes: 1000 } as const;
/** Other languages a listing may have besides the shop's main one. */
export const MAX_TRANSLATIONS = 10;
/** One fact about a product, e.g. its material; the seller writes them in the settings. */
export const MAX_PRODUCT_FACT_LENGTH = 500;
