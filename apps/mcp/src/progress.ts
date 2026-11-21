import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** How often a long tool call reports that it is still working. */
export const PROGRESS_INTERVAL_MS = 10_000;

/**
 * Reports progress while `work` runs, when the client asked for it. Clients
 * reset their request timeout on progress, so slow calls are not cancelled.
 */
export async function withProgress<T>(extra: Extra, message: string, work: Promise<T>): Promise<T> {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) return work;

  let progress = 0;
  const timer = setInterval(() => {
    progress += 1;
    void extra
      .sendNotification({
        method: 'notifications/progress',
        params: { progressToken, progress, message },
      })
      .catch(() => undefined);
  }, PROGRESS_INTERVAL_MS);
  try {
    return await work;
  } finally {
    clearInterval(timer);
  }
}
