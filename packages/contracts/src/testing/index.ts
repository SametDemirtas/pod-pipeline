import type { ResearchMarket } from '../dto.js';
import samples from './research-samples.json';

// Shared by the desktop test that checks the reports the app makes, and the window's tests.

/** First pages of Etsy searches, with titles written like real ones. */
export interface ResearchSample {
  readonly query: string;
  readonly market: ResearchMarket;
  readonly suggestions: readonly string[];
  readonly titles: readonly { title: string; shop: string; isAd?: boolean }[];
}

export type ResearchSampleName = keyof typeof samples;

export const RESEARCH_SAMPLES = samples as Readonly<Record<ResearchSampleName, ResearchSample>>;
