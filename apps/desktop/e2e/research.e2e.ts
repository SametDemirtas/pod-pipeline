import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, removeFolder, type LaunchedApp } from './launch-app.js';

let launched: LaunchedApp;
let files: string;

test.beforeEach(async () => {
  files = mkdtempSync(join(tmpdir(), 'pod-e2e-keywords-'));
  launched = await launchApp();
});

test.afterEach(async () => {
  try {
    await launched.close();
  } finally {
    removeFolder(files);
  }
});

test('imports a keyword list the seller exported from a keyword tool', async () => {
  const { window } = launched;
  const file = join(files, 'erank-tulip.csv');
  writeFileSync(file, 'Keyword,Searches\ntulip mug,1200\nspooky coffee cup,800\n');
  await launched.answerOpenDialog(file);
  await window.getByRole('link', { name: 'Research' }).click();

  await window.getByRole('button', { name: 'Import keyword list' }).click();

  await expect(window.getByRole('link', { name: 'erank-tulip.csv' })).toBeVisible();
  await expect(window.getByText('tulip mug', { exact: true }).first()).toBeVisible();
  await expect(window.getByText('spooky coffee cup', { exact: true }).first()).toBeVisible();
});
