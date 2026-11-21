import type { AiTell } from './find-ai-tells.js';
import { AI_TELL_CATEGORIES, type AiTellCategory } from './tell-patterns.js';

/** What the writer is asked to do about each kind of tell. */
const ADVICE: Readonly<Record<AiTellCategory, string>> = {
  'false-contrast':
    'build on a contrast nobody raised. Say plainly what the item is and what it shows',
  'cliche-opener': 'open with a stock sales formula. Start with what the item is',
  'cliche-closer': 'end on a stock sales line. End on the last concrete detail instead',
  'rhetorical-question': 'ask the buyer questions. Make plain statements instead',
  hype:
    'oversell, or claim what an item printed to order is not. Describe what the print shows ' +
    'and what the product is',
  'vague-praise':
    'praise with empty words. Name something concrete about the print instead, and keep ' +
    'opinion words out of the title',
  urgency: 'invent urgency or scarcity. Every item is printed to order, so leave it out',
  filler: 'say nothing about the item. Leave it out',
  structure: 'use capitals or strings of fragments for effect. Write ordinary full sentences',
  punctuation:
    'use marks a shop owner would not type. Use a comma, a full stop, a colon or brackets ' +
    'instead of dashes between words, and no emoji, Markdown, hashtags or runs of ! and ?',
};

/** Enough examples for the writer to find the rest. */
const MAX_QUOTED = 5;

/**
 * One problem per kind of tell, in words the writer can act on: it is asked
 * to rewrite the sentence, since a swapped synonym reads no better.
 */
export function aiTellProblems(tells: readonly AiTell[]): string[] {
  return AI_TELL_CATEGORIES.flatMap((category) => {
    const matches = [
      ...new Set(tells.filter((tell) => tell.category === category).map((tell) => tell.match)),
    ];
    if (matches.length === 0) return [];
    const quoted = matches
      .slice(0, MAX_QUOTED)
      .map((match) => `"${match}"`)
      .join(', ');
    return [
      `These phrases read as machine-written because they ${ADVICE[category]}: ${quoted}. ` +
        'Rewrite each sentence in your own plain words rather than swapping in a synonym.',
    ];
  });
}
