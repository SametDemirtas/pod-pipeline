import { z } from 'zod';
import { RESEARCH_MARKETS } from '../dto.js';
import { fields } from '../fields.js';

export const researchRequest = z
  .object({
    query: fields.researchQuery,
    /** The United States when left out. */
    market: z.enum(RESEARCH_MARKETS).optional(),
  })
  .strict();
export type ResearchRequest = z.infer<typeof researchRequest>;

export const researchIdRequest = z.object({ id: fields.researchId }).strict();
export type ResearchIdRequest = z.infer<typeof researchIdRequest>;

export const importKeywordListRequest = z
  .object({
    /** The market the file was exported for; the United States when left out. */
    market: z.enum(RESEARCH_MARKETS).optional(),
  })
  .strict();
export type ImportKeywordListRequest = z.infer<typeof importKeywordListRequest>;

export const keywordListIdRequest = z.object({ id: fields.keywordListId }).strict();
export type KeywordListIdRequest = z.infer<typeof keywordListIdRequest>;
