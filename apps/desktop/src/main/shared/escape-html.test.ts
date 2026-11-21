import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape-html.js';

describe('escapeHtml', () => {
  it('escapes every character that could end text or an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
    expect(escapeHtml('Plain words')).toBe('Plain words');
  });
});
