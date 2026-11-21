import {
  imageBase64,
  MAX_ANSWER_TOKENS,
  seesImages,
  type AiPart,
  type JsonAnswer,
  type JsonModel,
  type JsonQuestion,
} from '@pod/adapter-ai';
import type { JsonObject } from '@pod/adapter-http';
import { GEMINI } from './errors.js';
import { geminiRequest } from './gemini-api.js';
import { GEMINI_TEXT_MODELS } from './text-models.js';

/** Why Gemini stops when it will not write something: unsafe, copied or personal content. */
const REFUSALS: ReadonlySet<unknown> = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'RECITATION',
  'SPII',
]);

/** Gemini's thinking level for each effort. */
const THINKING_LEVELS: Readonly<Record<JsonQuestion['effort'], string>> = {
  low: 'LOW',
  medium: 'MEDIUM',
};

/** One Gemini model, asked through generateContent. */
export class GeminiJsonModel implements JsonModel {
  readonly service = GEMINI;
  readonly seesImages: boolean;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly apiKey: string,
    /** E.g. `gemini-3.8-flash`. */
    private readonly model: string,
    private readonly sleep?: (milliseconds: number) => Promise<void>,
  ) {
    this.seesImages = seesImages(GEMINI_TEXT_MODELS, model, GEMINI_TEXT_MODELS.othersSeeImages);
  }

  async ask(question: JsonQuestion): Promise<JsonAnswer> {
    const path = `/models/${encodeURIComponent(this.model)}:generateContent`;
    const response = await geminiRequest(
      this.fetchFn,
      this.apiKey,
      path,
      {
        systemInstruction: { parts: [{ text: question.system }] },
        contents: [{ role: 'user', parts: question.parts.map(contentPart) }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: question.schema,
          maxOutputTokens: MAX_ANSWER_TOKENS,
          // Thinking cannot be turned off from Gemini 3 on, only kept short.
          thinkingConfig: { thinkingLevel: THINKING_LEVELS[question.effort] },
        },
      },
      // A rate limit or an overloaded model makes nothing, so it is tried once more.
      { retries: 1, ...(this.sleep ? { sleep: this.sleep } : {}) },
    );
    const feedback = response['promptFeedback'] as JsonObject | undefined;
    const candidates = Array.isArray(response['candidates'])
      ? (response['candidates'] as JsonObject[])
      : [];
    const finish = candidates[0]?.['finishReason'];
    if (feedback?.['blockReason'] || REFUSALS.has(finish)) return { kind: 'refused' };
    if (finish === 'MAX_TOKENS') return { kind: 'cut-off' };
    return { kind: 'text', text: textOf(candidates[0]) };
  }
}

/** A request part, with images sent as the bytes the app holds. */
function contentPart(part: AiPart): JsonObject {
  if ('text' in part) return { text: part.text };
  return {
    inlineData: {
      mimeType: part.image.mimeType,
      data: imageBase64(part.image),
    },
  };
}

/** The answer's text, leaving out any thoughts Gemini shows. */
function textOf(candidate: JsonObject | undefined): string | undefined {
  const content = candidate?.['content'] as JsonObject | undefined;
  const parts = Array.isArray(content?.['parts']) ? (content['parts'] as JsonObject[]) : [];
  const text = parts
    .flatMap((part) => (typeof part['text'] === 'string' && !part['thought'] ? [part['text']] : []))
    .join('');
  return text || undefined;
}
