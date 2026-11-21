// Writes the license notices of the npm packages bundled into the app at the end of
// THIRD_PARTY_NOTICES.md, which packaged builds ship. The packages are the ones the
// bundled code imports (the desktop app's main process and preload script, the window
// and the MCP server), everything they depend on in production, as installed, and the
// build tools whose helper code the bundles carry.
//
//   npm run notices             rewrite the generated part
//   npm run notices -- --check  fail if it is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { APACHE_TERMS, bundledPackages, type BundledPackage } from './notices/bundled-packages.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTICES_FILE = join(ROOT, 'THIRD_PARTY_NOTICES.md');
/** Everything after this line is generated; everything before it is written by hand. */
const MARKER =
  '<!-- Written by `npm run notices` from here on; edit the script, not this part. -->';
/** Licenses whose full text the hand-written part gives, by SPDX id and a line of that text. */
const FULL_TEXTS: Readonly<Record<string, string>> = {
  MIT: 'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'Apache-2.0': APACHE_TERMS,
};

/** A fenced block that no line of the text can close early. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

function packageLabel(pkg: BundledPackage): string {
  return `${pkg.name}@${pkg.version}`;
}

function packageTable(packages: readonly BundledPackage[]): string {
  const rows = packages.map((pkg) => {
    const name = pkg.url ? `[${pkg.name}](${pkg.url})` : pkg.name;
    return `| ${name} | ${pkg.version} | ${pkg.license} |`;
  });
  return ['| Package | Version | License |', '| --- | --- | --- |', ...rows].join('\n');
}

/** Each distinct license text once, with the packages that ship it. */
function licenseTexts(packages: readonly BundledPackage[]): string {
  const byText = new Map<string, BundledPackage[]>();
  for (const pkg of packages.filter((each) => each.licenseText !== null)) {
    const key = (pkg.licenseText ?? '').replace(/\s+/g, ' ');
    byText.set(key, [...(byText.get(key) ?? []), pkg]);
  }
  return [...byText.values()]
    .map((group) => {
      const [first] = group;
      const names = group.map(packageLabel).join(', ');
      return `### ${names}\n\n${fenced(first?.licenseText ?? '')}`;
    })
    .join('\n\n');
}

function withoutLicenseFile(packages: readonly BundledPackage[], handWritten: string): string {
  const missing = packages.filter((pkg) => pkg.licenseText === null);
  for (const pkg of missing) {
    const line = FULL_TEXTS[pkg.license];
    if (line === undefined || !handWritten.includes(line)) {
      throw new Error(`${packageLabel(pkg)} ships no license file; add the ${pkg.license} text.`);
    }
  }
  if (missing.length === 0) return '';
  const lines = missing.map((pkg) => `- ${packageLabel(pkg)}: ${pkg.license}`);
  return [
    '### Packages without a license file',
    'These packages state their license only in their package.json; the full text of that license is given above.',
    lines.join('\n'),
  ].join('\n\n');
}

function noticeTexts(packages: readonly BundledPackage[]): string {
  const withNotice = packages.filter((pkg) => pkg.noticeText !== null);
  if (withNotice.length === 0) return '';
  const notices = withNotice.map(
    (pkg) => `### ${packageLabel(pkg)}\n\n${fenced(pkg.noticeText ?? '')}`,
  );
  return ['## NOTICE files of bundled packages', ...notices].join('\n\n');
}

function generatedPart(packages: readonly BundledPackage[], handWritten: string): string {
  if (!handWritten.includes(APACHE_TERMS)) throw new Error('The Apache 2.0 text is missing.');
  return [
    MARKER,
    '## Packages bundled into the app',
    'These are the npm packages that the app’s main process, preload script and window, and the MCP server, import, every package those depend on in production, and Vite, whose helper code the build adds. The list may name a few packages whose code the build leaves out. Each one’s license text follows, once for every distinct text, and then any NOTICE files the packages ship.',
    packageTable(packages),
    '## License texts of bundled packages',
    licenseTexts(packages),
    withoutLicenseFile(packages, handWritten),
    noticeTexts(packages),
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

async function notices(): Promise<string> {
  const current = readFileSync(NOTICES_FILE, 'utf8');
  const handWritten = current.split(MARKER)[0]?.trimEnd() ?? '';
  const text = `${handWritten}\n\n${generatedPart(bundledPackages(ROOT), handWritten)}\n`;
  const options = await resolveConfig(NOTICES_FILE);
  return format(text, { ...options, filepath: NOTICES_FILE });
}

const expected = await notices();
if (process.argv.includes('--check')) {
  if (readFileSync(NOTICES_FILE, 'utf8') !== expected) {
    console.error(
      `${relative(process.cwd(), NOTICES_FILE)} is out of date; run npm run notices and commit it.`,
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(NOTICES_FILE, expected);
}
