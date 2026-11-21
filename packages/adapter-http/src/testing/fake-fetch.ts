export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  /** JSON bodies parsed, form bodies as their fields, multipart bodies as given. */
  readonly body: unknown;
}

export interface FakeReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

function decode(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (body instanceof FormData || body === undefined || body === null) return body ?? undefined;
  if (typeof body !== 'string') return body;
  const type = new Headers(init?.headers).get('Content-Type') ?? '';
  if (type.includes('json')) return JSON.parse(body) as unknown;
  return Object.fromEntries(new URLSearchParams(body));
}

/** Answers requests in order from a queue and records what was sent. */
export class FakeFetch {
  readonly requests: RecordedRequest[] = [];
  private readonly replies: FakeReply[] = [];

  reply(...replies: FakeReply[]): this {
    this.replies.push(...replies);
    return this;
  }

  readonly fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    this.requests.push({
      url,
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: decode(init),
    });
    const reply = this.replies.shift();
    if (!reply) return Promise.reject(new Error(`No reply queued for ${url}`));
    const status = reply.status ?? 200;
    const text =
      status === 204
        ? null
        : typeof reply.body === 'string'
          ? reply.body
          : JSON.stringify(reply.body ?? {});
    return Promise.resolve(new Response(text, { status, headers: reply.headers ?? {} }));
  };
}
