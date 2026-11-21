import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { png } from '@pod/adapter-fs/testing';
import { launchApp, removeFolder, type LaunchedApp } from './launch-app.js';

let launched: LaunchedApp;
let designs: string;

test.beforeEach(async () => {
  designs = mkdtempSync(join(tmpdir(), 'pod-e2e-designs-'));
  mkdirSync(join(designs, '01. Design - Frost Garden'));
  writeFileSync(join(designs, '01. Design - Frost Garden', 'Mug.png'), png(400, 170, 40));
  writeFileSync(join(designs, '01. Design - Frost Garden', 'Blanket.png'), png(300, 360, 90));
  writeFileSync(join(designs, '02 Kupa.png'), png(400, 170, 200));
  writeFileSync(join(designs, 'notes.txt'), 'not an image');
  launched = await launchApp();
});

test.afterEach(async () => {
  try {
    await launched.close();
  } finally {
    removeFolder(designs);
  }
});

test('imports a folder and shows the designs in the catalog', async () => {
  const { window } = launched;
  await expect(window.getByText('No designs yet')).toBeVisible();

  await launched.answerOpenDialog(designs);
  await window.getByRole('button', { name: 'Import designs' }).click();
  await window.getByRole('button', { name: 'Choose folder' }).click();

  await expect(window.getByText('New: 3')).toBeVisible();
  await expect(window.getByText('Skipped: 1')).toBeVisible();
  await window.getByRole('button', { name: 'Import 3 designs' }).click();
  await expect(window.getByText('3 designs added and 1 file skipped')).toBeVisible();
  await window.getByRole('button', { name: 'Close' }).click();

  const list = window.getByRole('list', { name: 'Designs' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(window.getByText('Showing 3 of 3')).toBeVisible();
  const thumbnail = list.getByRole('img').first();
  await expect(thumbnail).toHaveJSProperty('complete', true);
  expect(await thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);

  await list.getByRole('link', { name: /^01-mug,/ }).click();
  await expect(window.getByRole('heading', { name: '01-mug' })).toBeVisible();
  await expect(window.getByText('400 × 170 px')).toBeVisible();
});

test('makes an iPhone case and a Samsung case from one phone case file', async () => {
  const { window } = launched;
  mkdirSync(join(designs, '04. Meadow Bees'));
  writeFileSync(join(designs, '04. Meadow Bees', 'Telefon Kılıfı.png'), png(216, 384, 70));
  await launched.answerOpenDialog(designs);
  await window.getByRole('button', { name: 'Import designs' }).click();
  await window.getByRole('button', { name: 'Choose folder' }).click();

  await expect(window.getByText('New: 5')).toBeVisible();
  await window.getByRole('button', { name: 'Import 5 designs' }).click();
  await window.getByRole('button', { name: 'Close' }).click();

  const list = window.getByRole('list', { name: 'Designs' });
  await expect(
    list.getByRole('link', { name: /^04-phone-case, Meadow Bees iPhone case/ }),
  ).toBeVisible();
  await expect(
    list.getByRole('link', { name: /^04-samsung-case, Meadow Bees Samsung case/ }),
  ).toBeVisible();
});

test('says so when the folder holds nothing new', async () => {
  const { window } = launched;
  await launched.answerOpenDialog(designs);

  for (const expected of ['Import 3 designs', null]) {
    await window.getByRole('button', { name: 'Import designs' }).click();
    await window.getByRole('button', { name: 'Choose folder' }).click();
    if (expected) {
      await window.getByRole('button', { name: expected }).click();
      await window.getByRole('button', { name: 'Close' }).click();
    }
  }

  await expect(
    window.getByText('Everything in this folder is already in your catalog.'),
  ).toBeVisible();
});

test('switches the interface to Turkish and keeps it after reloading', async () => {
  const { window } = launched;
  await window.getByRole('link', { name: 'Settings' }).click();
  await window.getByRole('combobox', { name: 'Interface language' }).click();
  await window.getByRole('option', { name: 'Türkçe' }).click();

  await expect(window.getByRole('heading', { name: 'Ayarlar' })).toBeVisible();
  await window.reload();
  await expect(window.getByRole('link', { name: 'Tasarımlar' })).toBeVisible();
});

test('shows a thumbnail of artwork too large to decode on the main thread', async () => {
  const { window } = launched;
  const large = mkdtempSync(join(tmpdir(), 'pod-e2e-large-'));
  mkdirSync(join(large, '05. Design - Big Throw'));
  // 42 million pixels, over the size thumbnails are made of in a worker thread.
  writeFileSync(join(large, '05. Design - Big Throw', 'Blanket.png'), png(7000, 6000, 120));
  await launched.answerOpenDialog(large);
  await window.getByRole('button', { name: 'Import designs' }).click();
  await window.getByRole('button', { name: 'Choose folder' }).click();
  await window.getByRole('button', { name: 'Import 1 design' }).click();
  await window.getByRole('button', { name: 'Close' }).click();

  const thumbnail = window.getByRole('list', { name: 'Designs' }).getByRole('img');
  await expect(thumbnail).toHaveJSProperty('complete', true, { timeout: 30_000 });
  expect(await thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
  removeFolder(large);
});
