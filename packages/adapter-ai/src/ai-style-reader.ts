import {
  lookChoicesOf,
  type PreviewImage,
  type SceneStyleReader,
  type StyleReading,
} from '@pod/core';
import { answerOf, seeingModel, type Expected } from './answers.js';
import type { ModelChoice } from './json-model.js';
import { NO_STYLE, STYLE_READER_SYSTEM, STYLE_SCHEMA } from './scene-prompts.js';
import { isTextList } from './text-list.js';

const STYLE_READING: Expected<StyleReading> = {
  subject: 'scene description',
  item: 'a scene description',
  read: ({ description, visible_words: words, look }) =>
    typeof description === 'string' && isTextList(words)
      ? {
          description: description.trim() === NO_STYLE ? null : description,
          visibleWords: words,
          // The look is only a suggestion, so a missing one or an unknown value is left at Auto.
          look: lookChoicesOf(
            typeof look === 'object' && look ? (look as Record<string, unknown>) : {},
          ),
        }
      : undefined,
};

/** Describes the style of a reference photo with a model that reads images. */
export class AiStyleReader implements SceneStyleReader {
  constructor(private readonly models: ModelChoice) {}

  async read(
    reference: PreviewImage,
    productType: string,
    avoid: readonly string[],
  ): Promise<StyleReading> {
    const copied = avoid.filter((item) => /[\p{L}\p{N}]/u.test(item));
    const request = [
      `OUR_PRODUCT_TYPE: ${productType}`,
      copied.length > 0
        ? `Your last description used words read off the reference: ${copied.join(', ')}. Describe the style again without them.`
        : '',
      copied.length < avoid.length ? 'Use no quotation marks or trademark signs.' : '',
    ].filter(Boolean);
    const question = {
      system: STYLE_READER_SYSTEM,
      parts: [{ image: reference }, { text: request.join('\n\n') }],
      effort: 'low',
      schema: STYLE_SCHEMA,
    } as const;
    return answerOf(await seeingModel(this.models), question, STYLE_READING);
  }
}
