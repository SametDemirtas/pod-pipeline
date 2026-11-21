import { fakeSdkFetch } from '@pod/adapter-http/testing';

/** Answers every request with `reply` and records what was sent. */
export const fakeClaude = fakeSdkFetch;

/** A finished Messages API answer holding `text`. */
export const message = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason,
  usage: { input_tokens: 10, output_tokens: 10 },
});
