import { bytes, counter, json, jsonOf, route, type FakeService } from './http.js';

/** Where the temporary links of uploaded files point. */
const LINK_HOST = 'https://dl.dropboxusercontent.com';

interface StoredFile {
  readonly id: string;
  readonly path: string;
  readonly content: Uint8Array;
}

const metadata = (file: StoredFile) => ({
  '.tag': 'file',
  id: file.id,
  name: file.path.split('/').pop(),
  path_lower: file.path.toLowerCase(),
  path_display: file.path,
  size: file.content.byteLength,
});

const notFound = () => json({ error_summary: 'path/not_found/..', error: { '.tag': 'path' } }, 409);

/** The files of the app folder, and the temporary links handed out for them. */
interface Folder {
  readonly files: Map<string, StoredFile>;
  readonly linked: Map<string, StoredFile>;
  readonly fileId: () => number;
}

const pathOf = async (request: Request) => String((await jsonOf(request))['path']);

function contentApi({ files, fileId }: Folder): FakeService {
  return {
    base: 'https://content.dropboxapi.com/2',
    signedIn: true,
    routes: [
      route('POST', '/files/upload', async (request) => {
        const argument = JSON.parse(request.headers.get('Dropbox-API-Arg') ?? '{}') as {
          path?: string;
        };
        const path = argument.path ?? '';
        if (files.has(path)) {
          return json({ error_summary: 'path/conflict/file/..', error: { '.tag': 'path' } }, 409);
        }
        const content = new Uint8Array(await request.arrayBuffer());
        const file = { id: `id:fake${String(fileId())}`, path, content };
        files.set(path, file);
        return json(metadata(file));
      }),
    ],
  };
}

function filesApi({ files, linked }: Folder): FakeService {
  return {
    base: 'https://api.dropboxapi.com/2',
    signedIn: true,
    routes: [
      route('POST', '/files/get_temporary_link', async (request) => {
        const file = files.get(await pathOf(request));
        if (!file) return notFound();
        const token = file.id.replace('id:', '');
        linked.set(token, file);
        return json({ metadata: metadata(file), link: `${LINK_HOST}/apitl/1/${token}` });
      }),
      route('POST', '/files/delete_v2', async (request) => {
        const path = await pathOf(request);
        const file = files.get(path);
        if (!file) return notFound();
        files.delete(path);
        return json({ metadata: metadata(file) });
      }),
    ],
  };
}

function temporaryLinks({ files, linked }: Folder): FakeService {
  return {
    base: LINK_HOST,
    routes: [
      route('GET', '/apitl/1/:token', (_request, [token = '']) => {
        const file = linked.get(token);
        return file && files.has(file.path)
          ? bytes(file.content, 'application/octet-stream')
          : json({ error: 'Not found' }, 404);
      }),
    ],
  };
}

/** The app folder of a Dropbox account: uploads, temporary links and deletes. */
export function fakeDropbox(): FakeService[] {
  const folder: Folder = { files: new Map(), linked: new Map(), fileId: counter(1) };
  return [contentApi(folder), filesApi(folder), temporaryLinks(folder)];
}
