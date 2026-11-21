export interface SentToSdk {
  readonly url: string;
  readonly headers: Headers;
  /** A JSON body as parsed; a form's fields, with files as `File`s. */
  readonly body: Record<string, unknown>;
}

/**
 * A fetch for an AI service's SDK that answers every request with `reply` and
 * records what was sent.
 */
export function fakeSdkFetch(reply: unknown, status = 200) {
  const sent: SentToSdk[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    // An SDK hands uploads to fetch as a form, which is read as it was given.
    const form = init?.body instanceof FormData ? init.body : undefined;
    const text = form ? '' : await request.text();
    sent.push({
      url: request.url,
      headers: request.headers,
      body: form
        ? Object.fromEntries(form.entries())
        : text
          ? (JSON.parse(text) as Record<string, unknown>)
          : {},
    });
    return new Response(JSON.stringify(reply), {
      status,
      // Lets a test see an SDK's retries without waiting for them.
      headers: { 'content-type': 'application/json', 'retry-after-ms': '0' },
    });
  };
  // Without its own `Response`, the OpenAI SDK fetches a `data:` URL to learn whether forms can be sent.
  return { sent, fetchFn: Object.assign(fetchFn, { Response }) };
}
