import { describe, expect, it } from 'vitest';
import { LISTING_TEXT_SCHEMA } from './listing-prompts.js';
import { schemaInstruction } from './schema-instruction.js';

describe('schemaInstruction', () => {
  it('asks for JSON alone and spells out the schema', () => {
    const instruction = schemaInstruction(LISTING_TEXT_SCHEMA);

    expect(instruction).toContain('Answer with one JSON object and nothing else');
    expect(instruction).toContain(JSON.stringify(LISTING_TEXT_SCHEMA));
  });
});
