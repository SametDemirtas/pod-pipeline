import { describe, expect, it } from 'vitest';
import { sceneCheckerSystem } from './scene-prompts.js';

describe('sceneCheckerSystem', () => {
  it.each([
    ['en', 'English (en)'],
    ['tr', 'Turkish (tr)'],
    ['de', 'German (de)'],
  ])('asks for the issues in the language %s', (language, label) => {
    expect(sceneCheckerSystem(language)).toContain(
      `Write them in ${label}, for the seller to read; quote text from the images as it is written there.`,
    );
  });
});
