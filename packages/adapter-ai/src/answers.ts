import { AiAnswerError } from './answer-error.js';
import type { JsonModel, JsonQuestion, ModelChoice } from './json-model.js';

/** What an answer should hold, and how to read it. */
export interface Expected<T> {
  /** What is asked for, for error messages, e.g. `scene check`. */
  readonly subject: string;
  /** The subject as one item, e.g. `a scene check`; left out for one such as `listing text`. */
  readonly item?: string;
  /** The answer's value, or `undefined` when its fields have the wrong shape. */
  readonly read: (fields: Readonly<Record<string, unknown>>) => T | undefined;
}

/** Some models wrap JSON in a Markdown code fence even when asked not to. */
const FENCED = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

/** Asks `model` once and reads the answer, or says in the seller's terms what went wrong. */
export async function answerOf<T>(
  model: JsonModel,
  question: JsonQuestion,
  expected: Expected<T>,
): Promise<T> {
  const { subject } = expected;
  const { service } = model;
  const fail = (message: string) => new AiAnswerError(service, `${service} ${message}`);
  const answer = await model.ask(question);
  if (answer.kind === 'refused') throw fail(`declined to write the ${subject}`);
  if (answer.kind === 'cut-off') throw fail(`ran out of room before finishing the ${subject}`);
  if (answer.text === undefined) throw fail(`sent no ${subject}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.text.replace(FENCED, '$1'));
  } catch {
    throw fail(`sent ${subject} that is not JSON`);
  }
  // An array is an object to JavaScript but not the object the answer was asked for.
  const fields =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  const value = expected.read(fields as Readonly<Record<string, unknown>>);
  if (value === undefined) {
    throw fail(`sent ${expected.item ?? subject} in an unexpected shape`);
  }
  return value;
}

/** The chosen model, when it reads images; comparing photos needs one that does. */
export async function seeingModel(models: ModelChoice): Promise<JsonModel> {
  const model = await models.current();
  if (!model.seesImages) {
    const { service } = model;
    throw new AiAnswerError(
      service,
      `${service}'s chosen model cannot read images; choose one that does`,
    );
  }
  return model;
}
