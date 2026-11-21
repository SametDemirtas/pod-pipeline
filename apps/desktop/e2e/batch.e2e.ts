import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { png } from '@pod/adapter-fs/testing';
import { launchApp, removeFolder, type LaunchedApp } from './launch-app.js';

let launched: LaunchedApp;
let designs: string;

test.beforeEach(async () => {
  designs = mkdtempSync(join(tmpdir(), 'pod-e2e-batch-'));
  mkdirSync(join(designs, '01. Meadow Bees'));
  writeFileSync(join(designs, '01. Meadow Bees', 'Mug.png'), png(400, 170, 40));
  writeFileSync(join(designs, '01. Meadow Bees', 'Blanket.png'), png(300, 360, 90));
  launched = await launchApp();
});

test.afterEach(async () => {
  try {
    await launched.close();
  } finally {
    removeFolder(designs);
  }
});

test('prepares the picked designs in the background and says why each one stopped', async () => {
  const { window } = launched;
  await launched.answerOpenDialog(designs);
  await window.getByRole('button', { name: 'Import designs' }).click();
  await window.getByRole('button', { name: 'Choose folder' }).click();
  await window.getByRole('button', { name: 'Import 2 designs' }).click();
  await window.getByRole('button', { name: 'Close' }).click();

  const toolbar = window.getByRole('toolbar', { name: 'Selected designs' });
  await toolbar.getByRole('button', { name: 'Select all 2 matching' }).click();
  await expect(toolbar.getByText('2 designs selected')).toBeVisible();
  await toolbar.getByRole('button', { name: 'Prepare listings' }).click();

  const dialog = window.getByRole('dialog', { name: 'Prepare listings' });
  for (const step of [/Etsy draft/, /Listing text and translations/, /Keywords from your lists/]) {
    await dialog.getByRole('checkbox', { name: step }).click();
  }
  await expect(dialog.getByText('Print checks: 2, free.')).toBeVisible();
  await expect(dialog.getByText(/Printful mockups: 2, free/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Start' }).click();

  const progress = window.getByRole('dialog', { name: 'Listing preparation' });
  await expect(progress.getByText('Finished')).toBeVisible();
  const stopped = progress.getByRole('list', { name: 'Designs that stopped' });
  await expect(stopped.getByRole('listitem')).toHaveCount(2);
  await expect(stopped.getByText('Connect Printful in the settings first.').first()).toBeVisible();
  await expect(progress.getByRole('button', { name: 'Retry failed' })).toBeVisible();
});
