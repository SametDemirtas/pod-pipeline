import { fakeSdkFetch } from '@pod/adapter-http/testing';

/** Answers every request with `reply` and records what was sent. */
export const fakeOpenAi = fakeSdkFetch;

/** A Chat Completions answer holding `content`. */
export const completion = (
  content: string | null,
  finish_reason = 'stop',
  refusal: string | null = null,
) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-6.1-sol',
  choices: [{ index: 0, finish_reason, message: { role: 'assistant', content, refusal } }],
});

/** An error body as OpenAI-compatible APIs send it. */
export const apiError = (message: string, type = 'invalid_request_error') => ({
  error: { message, type, code: null, param: null },
});
