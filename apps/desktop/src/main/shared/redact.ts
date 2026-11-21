const HIDDEN = '[hidden]';
/** The fewest characters a key or token has. */
const MIN_SECRET = 8;

/**
 * Names whose values are secrets, as headers, settings, form fields or JSON
 * keys, in snake_case, kebab-case and camelCase alike.
 */
const SECRET_KEYS = [
  '(?:access|refresh|id|session)[_-]?token',
  '(?:client|shared|app)[_-]?secret',
  'secret[_-]?access[_-]?key',
  '(?:x[_-](?:goog[_-])?)?api[_-]?key',
  'keystring',
  'password',
  'token',
].join('|');

/** Secrets an error message or stack may carry, e.g. a presigned link or a header. */
const SECRETS: readonly (readonly [RegExp, string])[] = [
  [/(https?:\/\/[^\s?#"'<>]+)\?[^\s#"'<>]*/g, '$1'],
  [/\b(Bearer|Basic)\s+[^\s"',]+/gi, `$1 ${HIDDEN}`],
  [/\bSignature=[0-9a-f]+/gi, `Signature=${HIDDEN}`],
  [/\bsk-[\w-]{16,}/g, HIDDEN],
  [/\bpin[ar]_[\w.-]+/g, HIDDEN],
  [/\bAIza[\w-]+/g, HIDDEN],
  // Dropbox access tokens.
  [/\bsl\.[\w-]{20,}/g, HIDDEN],
  // `name=value`, `name: 'value'` as util.inspect prints it, and `"name":"value"` in JSON;
  // a quoted value is hidden up to its closing quote, spaces and escaped quotes and all.
  // Only values long enough to be a secret, so words such as `token: missing` stay readable.
  [
    new RegExp(
      `\\b(${SECRET_KEYS})(["']?\\s*[:=]\\s*)(?:(["'])(?:\\\\.|(?!\\3).){${MIN_SECRET},}\\3|[^\\s&"',}]{${MIN_SECRET},})`,
      'gi',
    ),
    `$1$2$3${HIDDEN}$3`,
  ],
];

/** The text with keys, tokens and signed links in it hidden. */
export function redact(text: string): string {
  return SECRETS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}
