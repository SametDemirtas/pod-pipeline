import { z } from 'zod';
import { fields } from '../fields.js';

const mockupOfDesign = { designId: fields.designId, mockupId: fields.mockupId };

export const createSceneRequest = z
  .object({
    ...mockupOfDesign,
    prompt: fields.scenePrompt,
    look: fields.sceneLook,
    /** Two are made alike when the seller wants the better of them kept. */
    candidates: z.literal([1, 2]),
  })
  .strict();
export type CreateSceneRequest = z.infer<typeof createSceneRequest>;

export const previewSceneLookRequest = z
  .object({ familyId: fields.familyId, look: fields.sceneLook })
  .strict();
export type PreviewSceneLookRequest = z.infer<typeof previewSceneLookRequest>;

export const removeMockupRequest = z.object(mockupOfDesign).strict();
export type RemoveMockupRequest = z.infer<typeof removeMockupRequest>;

export const savePhotoRequest = z.object(mockupOfDesign).strict();
export type SavePhotoRequest = z.infer<typeof savePhotoRequest>;

export const confirmScenePrintRequest = z
  .object({ ...mockupOfDesign, confirmed: z.boolean() })
  .strict();
export type ConfirmScenePrintRequest = z.infer<typeof confirmScenePrintRequest>;

export const checkSceneAgainRequest = z.object(mockupOfDesign).strict();
export type CheckSceneAgainRequest = z.infer<typeof checkSceneAgainRequest>;

export const describeSceneStyleRequest = z
  .object({
    designId: fields.designId,
    /** A dropped PNG or JPEG file; the system file picker opens when left out. */
    image: fields.referenceImage.optional(),
  })
  .strict();
export type DescribeSceneStyleRequest = z.infer<typeof describeSceneStyleRequest>;
