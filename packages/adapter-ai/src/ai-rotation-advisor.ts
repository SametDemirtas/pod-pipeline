import type { RotationAdvice, RotationAdvisor, RotationQuestion } from '@pod/core';
import { answerOf, seeingModel, type Expected } from './answers.js';
import type { ModelChoice } from './json-model.js';
import { ROTATION_SCHEMA, rotationAdvisorSystem, TURNS } from './rotation-prompts.js';

const DEGREES: Readonly<Record<(typeof TURNS)[number], RotationAdvice['degrees']>> = {
  none: 0,
  clockwise: 90,
  counterclockwise: 270,
};

const ADVICE: Expected<RotationAdvice> = {
  subject: 'turn advice',
  read: ({ turn, reason }) => {
    const known = TURNS.find((each) => each === turn);
    return known && typeof reason === 'string' && reason.trim() !== ''
      ? { degrees: DEGREES[known], reason: reason.trim() }
      : undefined;
  },
};

/** Judges with a model that reads images which way artwork can be turned to fill a print area. */
export class AiRotationAdvisor implements RotationAdvisor {
  /** `language` is the seller's, e.g. `de`, which the reason is written in. */
  constructor(
    private readonly models: ModelChoice,
    private readonly language: () => Promise<string>,
  ) {}

  async advise(question: RotationQuestion): Promise<RotationAdvice> {
    const { artworkOrientation, areaOrientation, product } = question;
    const ask = {
      system: rotationAdvisorSystem(await this.language()),
      parts: [
        { text: 'The artwork:' },
        { image: question.artwork },
        {
          text: `The artwork is ${artworkOrientation}; the print area of the ${product} is ${areaOrientation}. Which way should the artwork be turned?`,
        },
      ],
      effort: 'low',
      schema: ROTATION_SCHEMA,
    } as const;
    return answerOf(await seeingModel(this.models), ask, ADVICE);
  }
}
