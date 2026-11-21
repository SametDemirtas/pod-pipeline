import { z } from 'zod';
import { BATCH_STEPS, MAX_BATCH_DESIGNS } from '../dto/batch-dto.js';
import { RESEARCH_MARKETS } from '../dto.js';
import { fields } from '../fields.js';

/** Designs picked one by one, or every design the catalog filter matches. */
const batchSelection = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('designs'),
      designIds: z.array(fields.designId).min(1).max(MAX_BATCH_DESIGNS),
    })
    .strict(),
  z
    .object({
      kind: z.literal('filter'),
      familyId: fields.familyId.optional(),
      search: fields.search.optional(),
      /** Matching designs the seller unticked. */
      excludeIds: z.array(fields.designId).max(MAX_BATCH_DESIGNS).optional(),
    })
    .strict(),
]);
export type BatchSelection = z.infer<typeof batchSelection>;

/** Preparing listings for many designs; drafts need written text and mockups. */
export const batchRequest = z
  .object({
    selection: batchSelection,
    steps: z
      .array(z.enum(BATCH_STEPS))
      .min(1)
      .max(BATCH_STEPS.length)
      .refine((steps) => new Set(steps).size === steps.length, { message: 'Repeats a step' }),
    market: z.enum(RESEARCH_MARKETS),
  })
  .strict()
  .refine(
    ({ steps }) =>
      !steps.includes('draft') || (steps.includes('text') && steps.includes('mockups')),
    { message: 'Drafts need the text and mockups steps', path: ['steps'] },
  );
export type BatchRequest = z.infer<typeof batchRequest>;
