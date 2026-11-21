import { readFile } from 'node:fs/promises';
import { DropboxFileHost, S3FileHost, sizeOnDisk } from '@pod/adapter-file-hosts';
import { HttpDownloader } from '@pod/adapter-http';
import {
  PrintfulClient,
  PrintfulMockupGenerator,
  PrintfulPrintCatalog,
  PrintfulPrintSync,
} from '@pod/adapter-printful';
import type { FileHostKind } from '@pod/contracts';
import type {
  Clock,
  FileDownloader,
  FileHost,
  IdGenerator,
  MockupGenerator,
  PrintCatalog,
  PrintSync,
} from '@pod/core';
import type { ConnectionSecrets } from '../../application/connections/connection-secrets.js';
import { FileHostNotConnectedError } from '../../application/errors/connection-errors.js';
import { newTemporaryFile } from '../../files/temporary-file.js';
import { dataPath } from '../../files/data-folder.js';
import { translateDownloader, translateFileHost, translatePort } from '../provider-errors.js';

export interface PrintProviderOptions {
  readonly secrets: ConnectionSecrets;
  readonly dataDirectory: string;
  readonly fetch: typeof fetch;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly onReleaseFailed: (error: unknown) => void;
}

/** Copies into a plain `ArrayBuffer`, which `fetch` accepts as a request body. */
async function readBytes(absolutePath: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await readFile(absolutePath));
}

export interface PrintProviders {
  readonly printCatalog: PrintCatalog;
  readonly generator: MockupGenerator;
  readonly fileHost: FileHost;
  readonly downloader: FileDownloader;
  readonly printSync: PrintSync;
}

/** Printful, the active file host and the downloader, reading credentials when used. */
export function createPrintProviders(options: PrintProviderOptions): PrintProviders {
  const { secrets, fetch } = options;
  const client = new PrintfulClient({
    fetch,
    token: async () => (await secrets.printful.get())?.token,
  });
  return {
    printCatalog: translatePort(new PrintfulPrintCatalog(client), 'Printful', ['findProduct']),
    generator: translatePort(new PrintfulMockupGenerator(client), 'Printful', [
      'supportsOrientation',
    ]),
    printSync: translatePort(new PrintfulPrintSync(client), 'Printful', [
      'syncedVariants',
      'previews',
    ]),
    fileHost: activeFileHost(options, fileHosts(options)),
    downloader: translateDownloader(
      new HttpDownloader({
        fetch,
        temporaryFile: () => newTemporaryFile(dataPath(options.dataDirectory, 'downloads')),
      }),
    ),
  };
}

/** Every file host the seller can connect, each reading its credentials when used. */
function fileHosts(options: PrintProviderOptions): Readonly<Record<FileHostKind, FileHost>> {
  const { secrets, fetch, clock, ids } = options;
  const files = { fetch, readFile: readBytes, fileSize: sizeOnDisk, ids, clock };
  return {
    dropbox: translateFileHost(
      new DropboxFileHost({ credentials: () => secrets.fileHosts.dropbox.get(), ...files }),
      'Dropbox',
    ),
    s3: translateFileHost(
      new S3FileHost({ credentials: () => secrets.fileHosts.s3.get(), ...files }),
      'Cloudflare R2 or S3',
    ),
  };
}

/** Shares through whichever file host is connected, reporting a share it could not release. */
function activeFileHost(
  options: PrintProviderOptions,
  hosts: Readonly<Record<FileHostKind, FileHost>>,
): FileHost {
  return {
    share: async (file) => {
      const kind = await options.secrets.activeFileHost();
      if (!kind) throw new FileHostNotConnectedError();
      const shared = await hosts[kind].share(file);
      return {
        url: shared.url,
        release: () =>
          shared.release().catch((error: unknown) => {
            options.onReleaseFailed(error);
            throw error;
          }),
      };
    },
  };
}
