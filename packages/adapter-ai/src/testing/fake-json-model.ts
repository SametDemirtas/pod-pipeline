import type { JsonAnswer, JsonModel, JsonQuestion, ModelChoice } from '../json-model.js';

/** A finished answer holding `value` as JSON. */
export const jsonAnswer = (value: unknown): JsonAnswer => ({
  kind: 'text',
  text: JSON.stringify(value),
});

/** A model and its own choice: answers every question with `answer` and records what was asked. */
export class FakeJsonModel implements JsonModel, ModelChoice {
  readonly questions: JsonQuestion[] = [];

  constructor(
    private readonly answer: JsonAnswer,
    readonly seesImages = true,
    readonly service = 'Fake',
  ) {}

  current(): Promise<this> {
    return Promise.resolve(this);
  }

  ask(question: JsonQuestion): Promise<JsonAnswer> {
    this.questions.push(question);
    return Promise.resolve(this.answer);
  }

  /** The text parts of question `index`, in order; an image reads as an empty string. */
  texts(index = 0): string[] {
    return (this.questions[index]?.parts ?? []).map((part) => ('text' in part ? part.text : ''));
  }
}
