import { z } from 'zod';
import { fields } from '../fields.js';

/** A pin of one of the design's photos, published on its board at `publishAt`. */
export const planPinRequest = z
  .object({
    designId: fields.designId,
    mockupId: fields.mockupId,
    title: fields.pinText,
    description: fields.pinText,
    altText: fields.pinText,
    headline: fields.pinText,
    boardId: fields.boardId,
    publishAt: fields.publishAt,
  })
  .strict();
export type PlanPinRequest = z.infer<typeof planPinRequest>;

export const pinIdRequest = z.object({ id: fields.pinId }).strict();
export type PinIdRequest = z.infer<typeof pinIdRequest>;

export const publishPinNowRequest = z
  .object({
    id: fields.pinId,
    /** The seller confirmed publishing a pin that may already be on Pinterest. */
    confirmUnknown: z.boolean().optional(),
  })
  .strict();
export type PublishPinNowRequest = z.infer<typeof publishPinNowRequest>;
