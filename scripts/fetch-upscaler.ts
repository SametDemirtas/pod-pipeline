// Fetches Real-ESRGAN's ncnn Vulkan engine (MIT) and the two models the app uses
// (BSD-3-Clause) into apps/desktop/resources/upscaler/<os>, where the app looks for
// them in a checkout and electron-builder packs them from. Every archive is checked
// against its pinned SHA-256 before anything is unpacked.
//
//   npm run fetch:upscaler             the engine for this computer
//   npm run fetch:upscaler -- win      another platform's, for packaging it
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0';

interface Engine {
  readonly archive: string;
  readonly sha256: string;
  /** The program first, then the libraries it loads. */
  readonly files: readonly [string, ...string[]];
}

/** One archive per platform, from the v0.2.5.0 release of 24 April 2022. */
const ENGINES: Readonly<Record<string, Engine>> = {
  mac: {
    archive: 'realesrgan-ncnn-vulkan-20220424-macos.zip',
    sha256: 'e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a',
    files: ['realesrgan-ncnn-vulkan'],
  },
  win: {
    archive: 'realesrgan-ncnn-vulkan-20220424-windows.zip',
    sha256: 'abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d',
    files: ['realesrgan-ncnn-vulkan.exe', 'vcomp140.dll'],
  },
  linux: {
    archive: 'realesrgan-ncnn-vulkan-20220424-ubuntu.zip',
    sha256: 'e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96',
    files: ['realesrgan-ncnn-vulkan'],
  },
};

/** The illustration and the photo model; the archives' other models and samples stay out. */
const MODELS = [
  'realesrgan-x4plus-anime.bin',
  'realesrgan-x4plus-anime.param',
  'realesrgan-x4plus.bin',
  'realesrgan-x4plus.param',
];

const PLATFORMS: Readonly<Record<string, string>> = { darwin: 'mac', win32: 'win', linux: 'linux' };

const os = process.argv[2] ?? PLATFORMS[process.platform] ?? '';
const engine = ENGINES[os];
if (!engine) {
  console.error(`Choose one of: ${Object.keys(ENGINES).join(', ')}`);
  process.exit(1);
}

/** A stalled download fails instead of hanging the setup. */
const DOWNLOAD_TIMEOUT_MS = 120_000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'apps', 'desktop', 'resources', 'upscaler', os);
const work = mkdtempSync(join(tmpdir(), 'pod-upscaler-'));

try {
  console.log(`Downloading ${engine.archive}`);
  const response = await fetch(`${RELEASE}/${engine.archive}`, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Download failed: HTTP ${String(response.status)}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== engine.sha256) {
    throw new Error(`Checksum mismatch: expected ${engine.sha256}, got ${sha256}`);
  }
  const archive = join(work, engine.archive);
  writeFileSync(archive, bytes);

  // bsdtar reads zip files on macOS and Windows; GNU tar on Linux does not.
  const unpacked = join(work, 'unpacked');
  mkdirSync(unpacked);
  const unzip =
    process.platform === 'linux'
      ? spawnSync('unzip', ['-q', archive, '-d', unpacked], { stdio: 'inherit' })
      : spawnSync('tar', ['-xf', archive, '-C', unpacked], { stdio: 'inherit' });
  if (unzip.status !== 0) throw new Error('Unpacking failed');

  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, 'models'), { recursive: true });
  for (const file of engine.files) copyFileSync(join(unpacked, file), join(target, file));
  for (const model of MODELS) {
    copyFileSync(join(unpacked, 'models', model), join(target, 'models', model));
  }
  if (os !== 'win') chmodSync(join(target, engine.files[0]), 0o755);
  console.log(`Installed into ${target}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
