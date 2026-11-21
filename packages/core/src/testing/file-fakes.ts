import type { TemporaryFile, FileDownloader } from '../ports/downloads.js';
import type { FileHost, FileToShare, SharedFile } from '../ports/file-host.js';
import type { FakeSourceFolder } from './fakes.js';

export class FakeFileHost implements FileHost {
  readonly shared: FileToShare[] = [];
  released = 0;
  failRelease = false;

  share(file: FileToShare): Promise<SharedFile> {
    this.shared.push(file);
    return Promise.resolve({
      url: `https://host.test/${file.name}`,
      release: () => {
        this.released += 1;
        return this.failRelease ? Promise.reject(new Error('offline')) : Promise.resolve();
      },
    });
  }
}

/** Downloads into a {@link FakeSourceFolder}, so the fake inspector and asset store can read it. */
export class FakeDownloader implements FileDownloader {
  disposed = 0;

  constructor(private readonly folder: FakeSourceFolder) {}

  download(url: string): Promise<TemporaryFile> {
    const relativePath = `downloads/${url.split('/').slice(-2).join('-')}`;
    this.folder.write({ relativePath, content: url });
    return Promise.resolve({
      absolutePath: this.folder.absolutePath(relativePath),
      dispose: () => {
        this.disposed += 1;
        this.folder.remove(relativePath);
        return Promise.resolve();
      },
    });
  }
}
