// Finds the npm packages bundled into the app, with the license and notice files
// each one ships: the packages the bundled code imports and everything they need
// in production, as installed.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';

/** The workspaces whose code ends up in the packaged app. */
const BUNDLED_WORKSPACES = ['apps/desktop', 'apps/ui', 'apps/mcp'];
/** Provided by the Electron runtime, whose own notices electron-builder ships. */
const RUNTIME_PROVIDED = new Set(['electron']);
/** Build tools that put some of their own helper code into the bundles, and where they are installed. */
const BUILD_HELPERS = [{ name: 'vite', from: 'apps/desktop' }];
const LICENSE_FILE = /^(licen[cs]e|copying)(\.|-|$)/i;
const NOTICE_FILE = /^notice(\.|$)/i;
export const APACHE_TERMS = 'TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION';
const APACHE_END = 'END OF TERMS AND CONDITIONS';

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly license?: string | { readonly type?: string };
  readonly homepage?: string;
  readonly repository?: string | { readonly url?: string };
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>;
}

export interface BundledPackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly url: string | null;
  readonly licenseText: string | null;
  readonly noticeText: string | null;
}

function readPackageJson(directory: string): PackageJson {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as PackageJson;
}

/** The workspace folders of this repository, by package name. */
function workspaceFolders(root: string): Map<string, string> {
  const folders = new Map<string, string>();
  for (const group of ['apps', 'packages']) {
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      const folder = join(root, group, entry.name);
      if (entry.isDirectory() && existsSync(join(folder, 'package.json'))) {
        folders.set(readPackageJson(folder).name, folder);
      }
    }
  }
  return folders;
}

/** Source files that are bundled: tests, test helpers and end-to-end specs are not. */
function sourceFiles(folder: string): string[] {
  const source = join(folder, 'src');
  return readdirSync(source, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter((file) => !file.split(/[\\/]/).includes('testing'))
    .map((file) => join(source, file));
}

const IMPORTS = [
  /^\s*(?:import|export)\s+(?!type\s)[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** The package names a file imports at run time; type-only imports are left out. */
function importedPackages(file: string): string[] {
  const code = readFileSync(file, 'utf8');
  const specifiers = IMPORTS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => match[1] ?? ''),
  );
  return specifiers
    .filter((specifier) => /^[@\w]/.test(specifier) && !isBuiltin(specifier))
    .map((specifier) =>
      specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/'),
    )
    .filter((name) => !RUNTIME_PROVIDED.has(name));
}

/** The npm packages the bundled workspaces import, with the folder each resolves from. */
function importedThirdParty(root: string): Map<string, string> {
  const workspaces = workspaceFolders(root);
  const imported = new Map<string, string>();
  const pending = [...BUNDLED_WORKSPACES.map((folder) => join(root, folder))];
  const seen = new Set(pending);
  for (let folder = pending.pop(); folder !== undefined; folder = pending.pop()) {
    for (const name of new Set(sourceFiles(folder).flatMap(importedPackages))) {
      const workspace = workspaces.get(name);
      if (workspace === undefined) imported.set(name, folder);
      else if (!seen.has(workspace)) {
        seen.add(workspace);
        pending.push(workspace);
      }
    }
  }
  return imported;
}

/** The installed folder of `name` as Node would find it from `from`. */
function packageFolder(name: string, from: string): string | null {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = join(folder, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(folder) === folder) return null;
  }
}

/** What a package needs at run time: its dependencies and the peers it requires. */
function runtimeDependencies(pkg: PackageJson): { name: string; required: boolean }[] {
  const optionalPeer = (name: string) => pkg.peerDependenciesMeta?.[name]?.optional === true;
  return [
    ...Object.keys(pkg.dependencies ?? {}).map((name) => ({ name, required: true })),
    ...Object.keys(pkg.optionalDependencies ?? {}).map((name) => ({ name, required: false })),
    ...Object.keys(pkg.peerDependencies ?? {})
      .filter((name) => !optionalPeer(name))
      .map((name) => ({ name, required: true })),
  ];
}

/** Every installed package the imported ones need, by folder. */
function productionClosure(imported: Map<string, string>): Map<string, PackageJson> {
  const closure = new Map<string, PackageJson>();
  const pending = [...imported].map(([name, from]) => ({ name, from, required: true }));
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const folder = packageFolder(next.name, next.from);
    if (folder === null) {
      if (next.required) throw new Error(`${next.name} is not installed; run npm ci first.`);
      continue;
    }
    if (closure.has(folder)) continue;
    const pkg = readPackageJson(folder);
    closure.set(folder, pkg);
    for (const dependency of runtimeDependencies(pkg))
      pending.push({ ...dependency, from: folder });
  }
  return closure;
}

/** An Apache 2.0 license file without the terms given once above, keeping its copyright notice. */
function shortenedApache(text: string): string {
  const start = text.indexOf('Apache License');
  const end = text.indexOf(APACHE_END);
  if (!text.includes(APACHE_TERMS) || start < 0 || end < 0) return text;
  const rest = text.slice(end + APACHE_END.length);
  const copyright = rest.search(/^\s*Copyright/m);
  const reference = 'Apache License, Version 2.0; its full text is given above.';
  return [text.slice(0, start).trim(), reference, copyright < 0 ? '' : rest.slice(copyright).trim()]
    .filter((part) => part !== '')
    .join('\n\n');
}

function fileText(folder: string, pattern: RegExp): string | null {
  const files = readdirSync(folder)
    .filter((file) => pattern.test(file))
    .sort();
  if (files.length === 0) return null;
  return files
    .map((file) => shortenedApache(readFileSync(join(folder, file), 'utf8').trim()))
    .join('\n\n');
}

function licenseName(pkg: PackageJson): string {
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
  return license ?? 'not stated';
}

/** A web address for the package's source, from the many forms package.json allows. */
function packageUrl(pkg: PackageJson): string | null {
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const url = repository ?? pkg.homepage;
  if (url === undefined) return null;
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^(?:ssh|git|https?):\/\/(?:git@)?/, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^github:/, 'https://github.com/')
    .replace(/^([\w.-]+\/[\w.-]+)$/, 'https://github.com/$1');
}

/** The packages bundled from the checkout at `root`, with their license and notice texts, by name. */
export function bundledPackages(root: string): BundledPackage[] {
  const helpers = BUILD_HELPERS.map(({ name, from }) => {
    const folder = packageFolder(name, join(root, from));
    if (folder === null) throw new Error(`${name} is not installed; run npm ci first.`);
    return [folder, readPackageJson(folder)] as const;
  });
  const installed = [...productionClosure(importedThirdParty(root)), ...helpers];
  const packages = installed.map(([folder, pkg]) => ({
    name: pkg.name,
    version: pkg.version,
    license: licenseName(pkg),
    url: packageUrl(pkg),
    licenseText: fileText(folder, LICENSE_FILE),
    noticeText: fileText(folder, NOTICE_FILE),
  }));
  const unique = new Map(packages.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]));
  return [...unique.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
  );
}
