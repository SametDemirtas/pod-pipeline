import type Anthropic from '@anthropic-ai/sdk';
import {
  imageBase64,
  MAX_ANSWER_TOKENS,
  type AiPart,
  type JsonAnswer,
  type JsonModel,
  type JsonQuestion,
} from '@pod/adapter-ai';
import { CLAUDE } from './errors.js';
import { FALLBACK_MODELS } from './text-models.js';

/** One Claude model, asked through the Messages API. Every Claude model reads images. */
export class ClaudeJsonModel implements JsonModel {
  readonly service = CLAUDE;
  readonly seesImages = true;

  constructor(
    private readonly client: Anthropic,
    /** E.g. `claude-opus-5-5`. */
    private readonly model: string,
  ) {}

  async ask(question: JsonQuestion): Promise<JsonAnswer> {
    const fallback = FALLBACK_MODELS.has(this.model);
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: MAX_ANSWER_TOKENS,
      system: question.system,
      messages: [{ role: 'user', content: question.parts.map(contentBlock) }],
      output_config: {
        effort: question.effort,
        format: { type: 'json_schema', schema: question.schema },
      },
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    });
    if (response.stop_reason === 'refusal') return { kind: 'refused' };
    if (response.stop_reason === 'max_tokens') return { kind: 'cut-off' };
    const text = response.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
    );
    return { kind: 'text', text: text?.text };
  }
}

/** A message block for a part, with images sent as the bytes the app holds. */
function contentBlock(part: AiPart): Anthropic.Beta.BetaContentBlockParam {
  if ('text' in part) return { type: 'text', text: part.text };
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: part.image.mimeType,
      data: imageBase64(part.image),
    },
  };
}
