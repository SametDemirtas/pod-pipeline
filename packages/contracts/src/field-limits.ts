/** Bounds only the request schemas use, kept out of the package's exports. */
export const MAX_FAMILY_ID_LENGTH = 50;
export const MAX_DESIGN_ID_LENGTH = 100;
export const MAX_CURSOR_LENGTH = 1000;
export const MAX_PATH_LENGTH = 4096;
export const MAX_FINGERPRINT_LENGTH = 200;
/** Longest API key, token, authorization code or bucket setting accepted from the window. */
export const MAX_CREDENTIAL_LENGTH = 1000;
export const MAX_VARIANT_ID_LENGTH = 50;
export const MAX_PRINT_AREA_LENGTH = 50;
export const MAX_SIZE_LENGTH = 50;
/** BCP 47 language tags, e.g. `en-US`. */
export const MAX_LANGUAGE_LENGTH = 35;
export const MAX_MOCKUP_ID_LENGTH = 100;
export const MAX_RESEARCH_ID_LENGTH = 100;
export const MAX_KEYWORD_LIST_ID_LENGTH = 100;
export const MAX_PIN_ID_LENGTH = 100;
export const MAX_BOARD_ID_LENGTH = 30;
/** A generous bound on pin text; the app applies Pinterest's exact limits and explains them. */
export const MAX_PIN_TEXT_LENGTH = 2000;
/** Generous bounds on listing input; the app applies Etsy's exact rules and explains them. */
export const MAX_LISTING_TEXT_LENGTH = 20_000;
export const MAX_LISTING_ITEMS = 200;
export const MAX_SHOP_ID_LENGTH = 30;
/** Sizes a family's listings sell at most. */
export const MAX_LISTED_SIZES = 100;
