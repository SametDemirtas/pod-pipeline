import { type PlanPinRequest } from '@pod/contracts/client';
import {
  firstCharacters,
  PIN_TEXT_LIMITS,
  PIN_TIME_GRACE_MS,
  typedCharacterCount,
} from '@pod/rules';

export type PinTextField = keyof typeof PIN_TEXT_LIMITS;
export const PIN_FIELDS = ['title', 'description', 'altText', 'headline'] as const;

export interface PinForm {
  readonly mockupId: string;
  readonly boardId: string;
  readonly title: string;
  readonly description: string;
  readonly altText: string;
  readonly headline: string;
  /** As a `datetime-local` input holds it, in the seller's time zone. */
  readonly publishAt: string;
}

type PinFormField = PinTextField | 'mockupId' | 'boardId' | 'publishAt';
/** What is wrong: a field, or a publish time that has already passed. */
export type PinFormProblem = PinFormField | 'publishAtPast';

export const isPinTextField = (problem: PinFormProblem): problem is PinTextField =>
  problem in PIN_TEXT_LIMITS;

const pad = (value: number) => String(value).padStart(2, '0');

/** A `datetime-local` value for a time, in the computer's time zone. */
export function localDateTime(date: Date): string {
  return (
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The next full hour at least an hour away, a sensible first time. */
export function nextSlot(now: Date): string {
  const slot = new Date(now);
  slot.setMinutes(0, 0, 0);
  slot.setHours(slot.getHours() + 2);
  return localDateTime(slot);
}

export function initialPinForm(args: {
  readonly title: string;
  readonly mockupId: string;
  readonly boardId: string;
  readonly now: Date;
}): PinForm {
  return {
    mockupId: args.mockupId,
    boardId: args.boardId,
    title: firstCharacters(args.title, PIN_TEXT_LIMITS.title),
    description: '',
    altText: '',
    headline: '',
    publishAt: nextSlot(args.now),
  };
}

/** Fields that are missing, too long or in the past, in form order. */
export function pinFormProblems(form: PinForm, now: Date): PinFormProblem[] {
  const problems: PinFormProblem[] = [];
  if (!form.mockupId) problems.push('mockupId');
  if (!form.boardId) problems.push('boardId');
  for (const field of PIN_FIELDS) {
    const length = typedCharacterCount(form[field]);
    if ((field === 'title' && length === 0) || length > PIN_TEXT_LIMITS[field])
      problems.push(field);
  }
  const publishAt = new Date(form.publishAt).getTime();
  if (Number.isNaN(publishAt)) problems.push('publishAt');
  else if (publishAt < now.getTime() - PIN_TIME_GRACE_MS) problems.push('publishAtPast');
  return problems;
}

/** The request, or `null` while the form has problems. */
export function toPlanPinRequest(
  designId: string,
  form: PinForm,
  now: Date,
): PlanPinRequest | null {
  if (pinFormProblems(form, now).length > 0) return null;
  return {
    designId,
    mockupId: form.mockupId,
    boardId: form.boardId,
    title: form.title.trim(),
    description: form.description.trim(),
    altText: form.altText.trim(),
    headline: form.headline.trim(),
    publishAt: new Date(form.publishAt).toISOString(),
  };
}
