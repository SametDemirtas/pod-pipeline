import {
  classifyNetworkError,
  DownloadFailedError,
  readOnlyFailure,
  type ServiceFailure,
} from '@pod/adapter-http';
import type { FileDownloader, FileHost } from '@pod/core';
import {
  ProviderBusyError,
  ProviderFailedError,
  ProviderInterruptedError,
  ProviderUnavailableError,
} from '../application/errors/provider-errors.js';
import { PROVIDERS, type ProviderName } from './provider-registry.js';

/** The API error a classified failure reaches the seller as. */
function failureToAppError(failure: ServiceFailure, notConnected: (service: string) => Error) {
  switch (failure.kind) {
    case 'failed':
      return new ProviderFailedError(failure.service, failure.reason);
    case 'unreachable':
      return new ProviderUnavailableError(failure.service);
    case 'interrupted':
      return new ProviderInterruptedError(failure.service, failure.reason);
    case 'busy':
      return new ProviderBusyError(failure.service, failure.retryAfterSeconds);
    case 'not-connected':
      return notConnected(failure.service);
  }
}

/** How a request's failure is read; one that only reads changes nothing when it breaks off. */
export interface RequestKind {
  readonly readOnly?: boolean | undefined;
}

/** Turns adapter and network errors into the API errors clients translate. */
export function toAppError(
  error: unknown,
  service: ProviderName,
  { readOnly = false }: RequestKind = {},
): unknown {
  const read = (failure: ServiceFailure) => (readOnly ? readOnlyFailure(failure) : failure);
  for (const provider of PROVIDERS) {
    const outcome = 'outcome' in provider ? provider.outcome(error) : undefined;
    if (outcome) return outcome;
    const failure = provider.classify(error);
    if (failure) return failureToAppError(read(failure), provider.notConnected);
  }
  const network = classifyNetworkError(error);
  if (network?.kind === 'unreachable') return new ProviderUnavailableError(service);
  if (!network) return error;
  return readOnly
    ? new ProviderFailedError(service, network.reason)
    : new ProviderInterruptedError(service, network.reason);
}

/** Methods of `T` that return a promise, the only ones a translated port may have. */
type AsyncMethods<T> = {
  readonly [K in keyof T]: T[K] extends (...args: never[]) => unknown
    ? (...args: Parameters<T[K]>) => Promise<unknown>
    : unknown;
};

/**
 * The port with every method's errors translated for `service`, or for the one
 * chosen at the time of the error. Methods named in `reads` only read, so one
 * that broke off reads as failed rather than as maybe done.
 */
export function translatePort<T extends AsyncMethods<T>>(
  port: T,
  service: ProviderName | (() => Promise<ProviderName>),
  reads: readonly (keyof T)[] = [],
): T {
  return new Proxy(port, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      const method = value as (...args: unknown[]) => unknown;
      return async (...args: unknown[]): Promise<unknown> => {
        try {
          return await method.apply(target, args);
        } catch (error) {
          // When the chosen service cannot be read either, the service's own error is the one to keep.
          const name =
            typeof service === 'string' ? service : await service().catch(() => undefined);
          const readOnly = reads.includes(key as keyof T);
          throw name === undefined ? error : toAppError(error, name, { readOnly });
        }
      };
    },
  });
}

/** Sharing and releasing a file are both translated, since releasing happens later. */
export function translateFileHost(host: FileHost, service: ProviderName): FileHost {
  return {
    share: async (file) => {
      const shared = await translatePort(host, service).share(file);
      const translated = translatePort(shared, service);
      return { url: shared.url, release: () => translated.release() };
    },
  };
}

/** Failed downloads blame Printful; trouble writing the file locally is reported as it is. */
export function translateDownloader(downloader: FileDownloader): FileDownloader {
  return {
    download: async (url) => {
      try {
        return await downloader.download(url);
      } catch (error) {
        if (error instanceof DownloadFailedError) {
          throw new ProviderFailedError('Printful', error.message);
        }
        throw toAppError(error, 'Printful');
      }
    },
  };
}
