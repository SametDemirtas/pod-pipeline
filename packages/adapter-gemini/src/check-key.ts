import { geminiRequest } from './gemini-api.js';

/** Any working key may list the models, which costs nothing. */
export async function checkGeminiKey(apiKey: string, fetchFn: typeof fetch = fetch): Promise<void> {
  await geminiRequest(fetchFn, apiKey, '/models?pageSize=1');
}
