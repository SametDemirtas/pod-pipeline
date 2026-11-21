import { describe, expect, it } from 'vitest';
import { aiTellProblems } from './ai-tell-problems.js';
import type { AiTell } from './find-ai-tells.js';

const tell = (category: AiTell['category'], match: string): AiTell => ({
  category,
  field: 'description',
  match,
});

describe('aiTellProblems', () => {
  it('is empty for clean text', () => {
    expect(aiTellProblems([])).toEqual([]);
  });

  it('gives one problem per kind, quoting a few distinct phrases', () => {
    const problems = aiTellProblems([
      tell('urgency', 'selling fast'),
      tell('hype', 'a'),
      tell('hype', 'b'),
      tell('hype', 'a'),
      ...['c', 'd', 'e', 'f'].map((match) => tell('hype', match)),
    ]);

    expect(problems).toEqual([
      'These phrases read as machine-written because they oversell, or claim what an item ' +
        'printed to order is not. Describe what the print shows and what the product is: ' +
        '"a", "b", "c", "d", "e". Rewrite each sentence in your own plain words rather than ' +
        'swapping in a synonym.',
      'These phrases read as machine-written because they invent urgency or scarcity. Every ' +
        'item is printed to order, so leave it out: "selling fast". Rewrite each sentence in ' +
        'your own plain words rather than swapping in a synonym.',
    ]);
  });
});
