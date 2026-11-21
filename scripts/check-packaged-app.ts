// Starts the packaged app the way users and AI assistants do, from the unpacked
// electron-builder output: the window process until it serves its local API,
// and the bundled MCP server with `--mcp-server`, which must end once its stdin
// closes. The binary must refuse to run as plain Node. The upscaling engine is only
// looked at, never run: that it is there, signed on macOS, and built for this
// machine. The PNG scaling worker, taken out of the app's archive, runs once with
// no other files around it.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { extractAll } from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

/** The checkout, wherever the script is started from. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = resolve(process.argv[2] ?? join(ROOT, 'apps', 'desktop', 'release'));
/** Where the PNG scaling worker lies inside the app's archive. */
const ARCHIVED_CHUNKS = join('out', 'main', 'chunks');
/** How the binary marks a fuse that is off: the character `0`. */
const FUSE_OFF = 0x30;
/** As `MCP_SERVER_ARGUMENT` in the desktop app. */
const MCP_SERVER_ARGUMENT = '--mcp-server';
/** Chromium on Linux runners has no setuid sandbox helper. */
const LINUX_ARGUMENTS = process.platform === 'linux' ? ['--no-sandbox'] : [];

/** As `DATA_DIRECTORY_VARIABLE` and `LOCAL_API_CONNECTION_FILE` in the contracts. */
const DATA_DIRECTORY_VARIABLE = 'POD_DATA_DIR';
const LOCAL_API_CONNECTION_FILE = 'local-api.json';

/** A first start of the packaged runtime can take long on a cold disk or a busy runner. */
const MCP_ANSWER_TIMEOUT_MS = 120_000;
/** How much of the MCP server's stderr a failure message shows, from the end. */
const MAX_STDERR_LENGTH = 8_000;
const MCP_EXIT_TIMEOUT_MS = 10_000;
const APP_START_TIMEOUT_MS = 60_000;
const APP_POLL_MS = 500;
const WORKER_TIMEOUT_MS = 60_000;
/** Where a PNG's width is, after the 8-byte signature and the IHDR chunk's length and type. */
const PNG_WIDTH_OFFSET = 16;

interface PackagedApp {
  readonly exe: string;
  readonly resources: string;
}

function locate(): PackagedApp {
  if (process.platform === 'darwin') {
    const folder = readdirSync(release).find((name) => name.startsWith('mac'));
    const app = join(release, folder ?? 'mac', 'POD Pipeline.app', 'Contents');
    return { exe: join(app, 'MacOS', 'POD Pipeline'), resources: join(app, 'Resources') };
  }
  if (process.platform === 'win32') {
    const app = join(release, 'win-unpacked');
    return { exe: join(app, 'POD Pipeline.exe'), resources: join(app, 'resources') };
  }
  const app = join(release, 'linux-unpacked');
  return { exe: join(app, 'pod-pipeline'), resources: join(app, 'resources') };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function checkFuses({ exe }: PackagedApp): Promise<void> {
  const fuses = await getCurrentFuseWire(exe);
  if (Number(fuses[FuseV1Options.RunAsNode]) !== FUSE_OFF) {
    fail('The packaged app can still run as plain Node: its RunAsNode fuse is on');
  }
}

function checkMcp({ exe }: PackagedApp): Promise<void> {
  return new Promise((resolve) => {
    const server = spawn(exe, [...LINUX_ARGUMENTS, MCP_SERVER_ARGUMENT]);
    let output = '';
    let errors = '';
    let answered = false;
    // Drained, so the server never stalls on a full pipe, and kept for the failure message.
    server.stderr.on('data', (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-MAX_STDERR_LENGTH);
    });
    const timer = setTimeout(() => {
      server.kill();
      fail(
        `The MCP server did not answer within ${String(MCP_ANSWER_TIMEOUT_MS / 1000)} s: ${output}\nstderr: ${errors}`,
      );
    }, MCP_ANSWER_TIMEOUT_MS);
    server.once('error', (error) => {
      clearTimeout(timer);
      fail(`The MCP server could not start: ${error.message}\nstderr: ${errors}`);
    });
    server.once('exit', (code, signal) => {
      if (answered) return;
      clearTimeout(timer);
      // Waits for the pipes to close, so the message holds all the server wrote.
      server.once('close', () => {
        fail(
          `The MCP server exited with ${String(code ?? signal)} before it answered\nstderr: ${errors}`,
        );
      });
    });
    server.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (!output.startsWith('{')) fail(`The MCP server wrote other text to stdout: ${output}`);
      if (!answered && output.includes('"serverInfo"')) {
        answered = true;
        clearTimeout(timer);
        endMcp(server, resolve);
      }
    });
    // A server that exits early fails above; the write it cut off is no second failure.
    server.stdin.on('error', () => undefined);
    server.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'check', version: '0' },
        },
      })}\n`,
    );
  });
}

/** Closes the server's stdin, as a client does when it is done; the server must end by itself. */
function endMcp(server: ChildProcess, resolve: () => void): void {
  const timer = setTimeout(() => {
    server.kill();
    fail('The MCP server kept running after its stdin was closed');
  }, MCP_EXIT_TIMEOUT_MS);
  server.once('exit', () => {
    clearTimeout(timer);
    resolve();
  });
  server.stdin?.end();
}

function checkApp({ exe }: PackagedApp): Promise<void> {
  const data = mkdtempSync(join(tmpdir(), 'pod-packaged-'));
  const app = spawn(exe, LINUX_ARGUMENTS, {
    env: { ...process.env, [DATA_DIRECTORY_VARIABLE]: data },
    stdio: 'inherit',
  });
  let started = false;
  return new Promise<void>((resolve) => {
    const since = Date.now();
    const poll = setInterval(() => {
      if (existsSync(join(data, LOCAL_API_CONNECTION_FILE))) {
        started = true;
        clearInterval(poll);
        app.kill();
        removeLater(data);
        resolve();
      } else if (Date.now() - since > APP_START_TIMEOUT_MS) {
        clearInterval(poll);
        app.kill();
        fail('The packaged app did not start its local API within a minute');
      }
    }, APP_POLL_MS);
    app.once('error', (error) => {
      fail(`The packaged app could not start: ${error.message}`);
    });
    app.on('exit', (code: number | null) => {
      if (!started) fail(`The packaged app exited with ${String(code)} before it started`);
    });
  });
}

/** Removes a temporary folder; one the closing app still holds is left for the system to clear. */
function removeLater(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    // The folder is in the system's temporary folder, which is cleared on its own.
  }
}

/** Architecture names as `lipo` prints them, by `process.arch`. */
const LIPO_ARCHITECTURES: Readonly<Record<string, string>> = { arm64: 'arm64', x64: 'x86_64' };

function checkUpscaler({ resources }: PackagedApp): void {
  const folder = join(resources, 'upscaler');
  const program = join(
    folder,
    process.platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan',
  );
  const models = ['realesrgan-x4plus', 'realesrgan-x4plus-anime'].flatMap((model) =>
    ['bin', 'param'].map((extension) => join(folder, 'models', `${model}.${extension}`)),
  );
  const notices = join(resources, 'THIRD_PARTY_NOTICES.md');
  for (const file of [program, ...models, notices]) {
    if (!existsSync(file)) fail(`Missing from the package: ${file}`);
  }
  if (process.platform !== 'darwin') return;
  const signature = spawnSync('codesign', ['--verify', '--strict', '--verbose=2', program], {
    encoding: 'utf8',
  });
  if (signature.status !== 0) fail(`The upscaling engine is not signed: ${signature.stderr}`);
  const lipo = spawnSync('lipo', ['-info', program], { encoding: 'utf8' });
  const architecture = LIPO_ARCHITECTURES[process.arch] ?? process.arch;
  if (!lipo.stdout.split(/\s+/).includes(architecture)) {
    fail(`The upscaling engine is not built for ${architecture}: ${lipo.stdout}`);
  }
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length);
  head.write(type, 4, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(data, crc32(head.subarray(4))));
  return Buffer.concat([head, data, checksum]);
}

/**
 * Has the PNG scaling worker, as bundled in the app's archive, scale a small grey
 * image. The archive is unpacked into an empty folder, so a module the bundle left
 * out fails to load. The app's runtime cannot run it: the binary is not Node.
 */
function checkScaleWorker({ resources }: PackagedApp): void {
  const work = mkdtempSync(join(tmpdir(), 'pod-scale-'));
  const unpacked = join(work, 'app');
  extractAll(join(resources, 'app.asar'), unpacked);
  const chunks = join(unpacked, ARCHIVED_CHUNKS);
  const name = readdirSync(chunks).find((file) => file.startsWith('png-worker'));
  if (!name) fail(`No PNG scaling worker in the app's archive`);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64, 0);
  header.writeUInt32BE(48, 4);
  header.writeUInt8(8, 8);
  const rows = Buffer.concat(
    Array.from({ length: 48 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 100)])),
  );
  writeFileSync(
    join(work, 'in.png'),
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', header),
      pngChunk('IDAT', deflateSync(rows)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
  const job = {
    source: join(work, 'in.png'),
    target: join(work, 'out.png'),
    size: { width: 16, height: 12 },
  };
  writeFileSync(
    join(work, 'probe.mjs'),
    [
      "import { Worker } from 'node:worker_threads';",
      `const worker = new Worker(${JSON.stringify(join(chunks, name))});`,
      "worker.once('message', (reply) => { console.log(JSON.stringify(reply)); void worker.terminate(); });",
      "worker.once('error', (error) => { console.log(JSON.stringify({ ok: false, message: error.message })); });",
      `worker.postMessage({ type: 'scale', job: ${JSON.stringify(job)} });`,
    ].join('\n'),
  );
  const probe = spawnSync(process.execPath, [join(work, 'probe.mjs')], {
    encoding: 'utf8',
    timeout: WORKER_TIMEOUT_MS,
  });
  const scaled = existsSync(job.target) ? readFileSync(job.target) : Buffer.alloc(0);
  rmSync(work, { recursive: true, force: true });
  const width =
    scaled.length >= PNG_WIDTH_OFFSET + 4 ? scaled.readUInt32BE(PNG_WIDTH_OFFSET) : undefined;
  if (!probe.stdout.includes('"ok":true') || width !== job.size.width) {
    fail(`The PNG scaling worker did not run from the package: ${probe.stdout}${probe.stderr}`);
  }
}

const paths = locate();
if (!existsSync(paths.exe)) fail(`No packaged app at ${paths.exe}`);
await checkFuses(paths);
checkUpscaler(paths);
checkScaleWorker(paths);
// The window first, so the MCP server starts from a warm runtime.
await checkApp(paths);
await checkMcp(paths);
console.log('The packaged app and its MCP server start, and the upscaling engine is in place.');
