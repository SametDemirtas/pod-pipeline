import type { PreviewImage } from '@pod/core';

/** One piece of a question: some text or an image, sent in the order given. */
export type AiPart = { readonly text: string } | { readonly image: PreviewImage };

/** What a model is asked: its instructions, the user's parts and the answer's shape. */
export interface JsonQuestion {
  readonly system: string;
  readonly parts: readonly AiPart[];
  readonly effort: 'low' | 'medium';
  /**
   * The answer's shape as JSON Schema. A model whose API cannot enforce it is
   * told it in the prompt, with `schemaInstruction`.
   */
  readonly schema: Readonly<Record<string, unknown>>;
}

/** How a model's turn ended; `text` holds its answer, if it wrote one. */
export type JsonAnswer =
  | { readonly kind: 'text'; readonly text: string | undefined }
  | { readonly kind: 'refused' }
  | { readonly kind: 'cut-off' };

/** One language model that answers questions with JSON. */
export interface JsonModel {
  /** The name the seller knows the service by, e.g. `Claude`. */
  readonly service: string;
  /** Whether it reads images; parts with images are sent only to one that does. */
  readonly seesImages: boolean;
  ask(question: JsonQuestion): Promise<JsonAnswer>;
}

/**
 * The model the seller has chosen. The choice, and with it whether the model
 * reads images, may change between requests, so it is looked up for each one.
 */
export interface ModelChoice {
  current(): Promise<JsonModel>;
}

/**
 * The most tokens a model may write in one answer, the thinking before it
 * included, for every service alike.
 */
export const MAX_ANSWER_TOKENS = 16_000;
