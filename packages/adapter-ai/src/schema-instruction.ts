/** The answer's shape as words, for a model whose API takes JSON but cannot enforce a schema. */
export function schemaInstruction(schema: Readonly<Record<string, unknown>>): string {
  return `Answer with one JSON object and nothing else, matching this JSON Schema:\n${JSON.stringify(schema)}`;
}
