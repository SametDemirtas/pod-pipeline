import { describe, expect, it } from 'vitest';
import { redact } from './redact.js';

describe('redact', () => {
  it.each([
    ['key sk-ant-api03-abcDEF_123 refused', 'key [hidden] refused'],
    ['key AIzaSyA-12_xyz refused', 'key [hidden] refused'],
    ['key sk-proj-AbC123_def456-GhI789 refused', 'key [hidden] refused'],
    ['key sk-0123456789abcdef0123 refused', 'key [hidden] refused'],
    ['token pina_AbCd-123_xyz expired', 'token [hidden] expired'],
    ['refresh pinr_AbCd.123_xyz expired', 'refresh [hidden] expired'],
    ['Dropbox refused sl.BCDefgh-1234567890_abcdefg', 'Dropbox refused [hidden]'],
    [
      '{"id_token":"eyJhbGciOi","session-token": "s3ss10n-99"}',
      '{"id_token":"[hidden]","session-token": "[hidden]"}',
    ],
    ["{ sessionToken: 'abcdefgh1' }", "{ sessionToken: '[hidden]' }"],
    ['Authorization: Basic dXNlcjpwYXNz', 'Authorization: Basic [hidden]'],
    ['Authorization: bearer abc.def', 'Authorization: bearer [hidden]'],
    ["{ 'x-api-key': 'keystring:secret' }", "{ 'x-api-key': '[hidden]' }"],
    ['x-goog-api-key=gk-12345678', 'x-goog-api-key=[hidden]'],
    ['Credential=AK/20261027, Signature=0a1b2c', 'Credential=AK/20261027, Signature=[hidden]'],
    [
      '{"access_token":"t1234567","refresh_token": "t2345678"}',
      '{"access_token":"[hidden]","refresh_token": "[hidden]"}',
    ],
    ['client_secret=s3cret-99&grant_type=x', 'client_secret=[hidden]&grant_type=x'],
    [
      "{ secretAccessKey: 'wJalrXUt', apiKey: 'k1234567' }",
      "{ secretAccessKey: '[hidden]', apiKey: '[hidden]' }",
    ],
    [
      '{"secret_access_key":"wJalrXUt","api_key":"k1234567"}',
      '{"secret_access_key":"[hidden]","api_key":"[hidden]"}',
    ],
    ['api-key: k1234567, password=hunter22', 'api-key: [hidden], password=[hidden]'],
    ["{ token: 'pf-12345678' }", "{ token: '[hidden]' }"],
    [
      "{ refreshToken: 'r1234567', accessToken: 'a1234567', clientSecret: 'c1234567' }",
      "{ refreshToken: '[hidden]', accessToken: '[hidden]', clientSecret: '[hidden]' }",
    ],
    [
      "{ sharedSecret: 's1234567', appSecret: 's2345678' }",
      "{ sharedSecret: '[hidden]', appSecret: '[hidden]' }",
    ],
    ['keystring=ks123456', 'keystring=[hidden]'],
    ['{"x_api_key":"k1234567"}', '{"x_api_key":"[hidden]"}'],
    ['{"password":"a\\"b c d e f"}', '{"password":"[hidden]"}'],
    ["password: 'p a s s w o' given", "password: '[hidden]' given"],
    [
      'GET https://example.com/callback?code=c0de&state=s failed',
      'GET https://example.com/callback failed',
    ],
  ])('hides secrets in %j', (text, expected) => {
    expect(redact(text)).toBe(expected);
  });

  it.each([
    'a risk-free task-runner',
    'error code 500',
    'the shop answered with code=PRICE_TOO_LOW',
    'token: missing',
    'password: none',
    'see sl.short for details',
  ])('leaves readable text in %j as it is', (text) => {
    expect(redact(text)).toBe(text);
  });
});
