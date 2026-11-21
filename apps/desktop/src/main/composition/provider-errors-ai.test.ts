import { describe, expect, it } from 'vitest';
import { AiAnswerError } from '@pod/adapter-ai';
import { AnthropicNotConnectedError } from '@pod/adapter-anthropic';
import { GeminiError, GeminiNotConnectedError } from '@pod/adapter-gemini';
import { DEEPSEEK, OpenAiNotConnectedError, OpenAiVendorError } from '@pod/adapter-openai';
import { toAppError } from './provider-errors.js';

describe('toAppError for the AI services', () => {
  it.each([
    [new GeminiNotConnectedError(), { code: 'AI_NOT_CONNECTED', details: { service: 'Gemini' } }],
    [
      new GeminiError('400', { status: 400, reason: 'API_KEY_INVALID' }),
      { code: 'AI_NOT_CONNECTED', details: { service: 'Gemini' } },
    ],
    [
      new GeminiError('401', { status: 401 }),
      { code: 'AI_NOT_CONNECTED', details: { service: 'Gemini' } },
    ],
    [
      new GeminiError('Too many requests', { status: 429, retryAfterSeconds: 20 }),
      { code: 'PROVIDER_BUSY', details: { service: 'Gemini', retryAfterSeconds: 20 } },
    ],
    [
      new GeminiError('Billing not enabled', { status: 403 }),
      { code: 'PROVIDER_FAILED', details: { service: 'Gemini' } },
    ],
    [
      new AnthropicNotConnectedError(),
      { code: 'AI_NOT_CONNECTED', details: { service: 'Claude' } },
    ],
    [
      new OpenAiNotConnectedError(DEEPSEEK),
      { code: 'AI_NOT_CONNECTED', details: { service: 'DeepSeek' } },
    ],
    [
      new OpenAiVendorError('Kimi', new Error('model not found')),
      { code: 'PROVIDER_FAILED', details: { service: 'Kimi', reason: 'model not found' } },
    ],
    [
      new AiAnswerError('Claude', 'no text'),
      { code: 'PROVIDER_FAILED', details: { service: 'Claude' } },
    ],
    [
      new AiAnswerError('Kimi', "Kimi's chosen model cannot read images; choose one that does"),
      {
        code: 'PROVIDER_FAILED',
        details: {
          service: 'Kimi',
          reason: "Kimi's chosen model cannot read images; choose one that does",
        },
      },
    ],
  ])('maps %s', (error, expected) => {
    expect(toAppError(error, 'Claude')).toMatchObject(expected);
  });
});
