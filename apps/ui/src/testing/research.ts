import { createFakeApi, designDto } from './fake-api.js';

/** An app with a design whose mockups exist and Claude connected, so the writer shows. */
export async function withWriter() {
  const fake = createFakeApi([designDto('01-mug')]);
  await fake.api.connectAi({ provider: 'anthropic', apiKey: 'sk' });
  await fake.api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
  return fake;
}
