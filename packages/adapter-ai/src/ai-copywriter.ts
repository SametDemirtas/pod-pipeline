import type { CopyBrief, ListingCopywriter, ListingText } from '@pod/core';
import type { ListingTextRules } from '@pod/rules';
import { answerOf, type Expected } from './answers.js';
import type { AiPart, JsonModel, ModelChoice } from './json-model.js';
import {
  briefMessage,
  LISTING_TEXT_SCHEMA,
  reviserSystem,
  revisionMessage,
  translationMessage,
  translatorSystem,
  writerSystem,
} from './listing-prompts.js';
import { isTextList } from './text-list.js';

const LISTING_TEXT: Expected<ListingText> = {
  subject: 'listing text',
  read: ({ title, description, tags }) =>
    typeof title === 'string' && typeof description === 'string' && isTextList(tags)
      ? { title, description, tags }
      : undefined,
};

/** Writes and translates listing text with the seller's chosen language model. */
export class AiCopywriter implements ListingCopywriter {
  private readonly systems: Readonly<Record<'writer' | 'translator' | 'reviser', string>>;

  constructor(
    private readonly models: ModelChoice,
    rules: ListingTextRules,
  ) {
    this.systems = {
      writer: writerSystem(rules),
      translator: translatorSystem(rules),
      reviser: reviserSystem(rules),
    };
  }

  async write(brief: CopyBrief): Promise<ListingText> {
    const model = await this.models.current();
    // The brief says when there is no image, so it is built from what the model will see.
    const seen = model.seesImages ? brief : { ...brief, image: undefined };
    const text = { text: briefMessage(seen) };
    // The image comes first, so the brief is read with the print in view.
    return this.ask(
      model,
      this.systems.writer,
      seen.image ? [{ image: seen.image }, text] : [text],
    );
  }

  async translate(text: ListingText, language: string): Promise<ListingText> {
    const parts = [{ text: translationMessage(text, language) }];
    return this.ask(await this.models.current(), this.systems.translator, parts);
  }

  async revise(
    text: ListingText,
    problems: readonly string[],
    language: string,
  ): Promise<ListingText> {
    const parts = [{ text: revisionMessage(text, problems, language) }];
    return this.ask(await this.models.current(), this.systems.reviser, parts);
  }

  private ask(model: JsonModel, system: string, parts: readonly AiPart[]): Promise<ListingText> {
    const question = {
      system,
      parts,
      // Some deliberation pays for itself: a listing that breaks fewer rules needs fewer revisions.
      effort: 'medium',
      schema: LISTING_TEXT_SCHEMA,
    } as const;
    return answerOf(model, question, LISTING_TEXT);
  }
}
