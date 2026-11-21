interface Sent {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown> | undefined;
}

export type Reply = { status?: number; body: unknown } | { offline: true };

/** Answers requests with `replies` in turn and records what was sent. */
export function fakeGemini(...replies: Reply[]) {
  const sent: Sent[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    sent.push({
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string>) },
      body:
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined,
    });
    const reply = replies.shift();
    if (!reply) return Promise.reject(new Error('no reply queued'));
    if ('offline' in reply) return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 }),
    );
  };
  return { sent, fetchFn };
}
