import { describe, expect, it } from 'vitest';
import { AiAnswerError, AiServiceBusyError, AI_ANSWER_FAILURES } from './answer-error.js';

describe('AI_ANSWER_FAILURES', () => {
  it('reports an answer the app cannot use as failed at the service that sent it', () => {
    expect(AI_ANSWER_FAILURES.classify(new AiAnswerError('Claude', 'no text'))).toEqual({
      kind: 'failed',
      service: 'Claude',
      reason: 'no text',
    });
  });

  it('reports a service short of servers as busy, to try again later', () => {
    expect(AI_ANSWER_FAILURES.classify(new AiServiceBusyError('DeepSeek'))).toEqual({
      kind: 'busy',
      service: 'DeepSeek',
    });
  });

  it('leaves other errors to their own adapter', () => {
    expect(AI_ANSWER_FAILURES.classify(new Error('other'))).toBeUndefined();
  });
});
