type Responder = (request: Request) => Response | Promise<Response>;

/** Records every request and answers from a queue of responders, in order. */
export class ResponderFetch {
  readonly requests: Request[] = [];
  private readonly responders: Responder[] = [];

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    this.requests.push(request.clone());
    const responder = this.responders.shift();
    if (!responder) throw new Error(`Unexpected request ${request.method} ${request.url}`);
    return responder(request);
  };

  reply(...responders: Responder[]): this {
    this.responders.push(...responders);
    return this;
  }
}

export function json(body: unknown, status = 200): Responder {
  return () => Response.json(body, { status });
}

export function text(body: string, status: number): Responder {
  return () => new Response(body, { status });
}

export function empty(status = 200): Responder {
  return () => new Response(null, { status });
}
