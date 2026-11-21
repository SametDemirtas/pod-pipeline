import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { png } from '@pod/adapter-fs/testing';
import { callApp, launchApp, removeFolder, type LaunchedApp } from './launch-app.js';

let launched: LaunchedApp;
let designs: string;

test.beforeEach(async () => {
  designs = mkdtempSync(join(tmpdir(), 'pod-e2e-print-'));
  writeFileSync(join(designs, '01 Mug.png'), png(400, 170, 60));
  launched = await launchApp();
});

test.afterEach(async () => {
  try {
    await launched.close();
  } finally {
    removeFolder(designs);
  }
});

test('asks to connect Printful before the print check, with errors the window understands', async () => {
  const { window } = launched;
  await launched.answerOpenDialog(designs);
  await window.getByRole('button', { name: 'Import designs' }).click();
  await window.getByRole('button', { name: 'Choose folder' }).click();
  await window.getByRole('button', { name: 'Import 1 design' }).click();
  await window.getByRole('button', { name: 'Close' }).click();
  await window.getByRole('link', { name: /^01-mug,/ }).click();

  await expect(window.getByText('Connect Printful in the settings first.')).toBeVisible();
  await window.getByRole('link', { name: 'Open settings' }).first().click();

  await expect(window.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(window.getByLabel('Printful API token')).toHaveAttribute('type', 'password');
});

test("writes a scene look's line in the app and offers a top-down view only for flat products", async () => {
  const { window } = launched;
  const preview = (familyId: string, look: Record<string, string>) =>
    callApp(window, 'print:preview-scene-look', { familyId, look });

  const mug = await preview('mug', { shape: '1:1', cameraHeight: 'topDown', props: 'bare' });
  const shirt = await preview('t-shirt', { shape: '4:3' });
  const refused = await preview('mug', { shape: '4:3', lens: 'macro' });

  expect(mug).toMatchObject({
    ok: true,
    value: {
      line: 'Look (takes precedence over the scene description; everything below still applies): no props.',
      options: { cameraHeight: ['eyeLevel', 'slightlyAbove'] },
    },
  });
  expect(shirt).toMatchObject({
    ok: true,
    value: { line: null, options: { cameraHeight: ['eyeLevel', 'slightlyAbove', 'topDown'] } },
  });
  expect(refused).toMatchObject({ ok: false });
});
