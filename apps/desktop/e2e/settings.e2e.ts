import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch-app.js';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('copies how to connect an AI assistant to the clipboard', async () => {
  const { app, window } = launched;
  await app.evaluate(({ clipboard }) => {
    clipboard.clear();
  });
  await window.getByRole('link', { name: 'Settings' }).click();

  await window.getByRole('button', { name: 'Copy for Claude Code' }).click();

  await expect(window.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied).toContain('claude mcp add --scope user');
  expect(copied).toContain('--mcp-server');
});

test('saves the AI services the seller picks for text and scene photos', async () => {
  const { window, dataDirectory } = launched;
  await window.getByRole('link', { name: 'Settings' }).click();
  const section = (title: string) =>
    window.locator('div', { has: window.getByRole('heading', { name: title }) }).last();
  const text = section('Text AI');
  const image = section('Image AI');
  await expect(text.getByLabel('Anthropic API key')).toBeVisible();
  await expect(image.getByLabel('Gemini API key')).toBeVisible();

  await text.getByRole('combobox', { name: 'Service' }).click();
  await window.getByRole('option', { name: 'Kimi' }).click();
  await image.getByRole('combobox', { name: 'Service' }).click();
  await window.getByRole('option', { name: 'ChatGPT' }).click();

  await expect(text.getByLabel('Moonshot API key')).toBeVisible();
  await expect(text.getByText(/moonshot\.cn, are not supported/)).toBeVisible();
  await expect(image.getByLabel('OpenAI API key')).toBeVisible();
  await expect
    .poll(() => JSON.parse(readFileSync(join(dataDirectory, 'settings.json'), 'utf8')) as unknown)
    .toMatchObject({ textProvider: 'kimi', sceneProvider: 'openai' });
});

test('remembers that the seller’s designs are made with AI tools', async () => {
  const { window, dataDirectory } = launched;
  await window.getByRole('link', { name: 'Settings' }).click();

  await window.getByRole('switch', { name: 'My designs are made with AI tools' }).click();

  await expect(
    window.getByRole('switch', { name: 'My designs are made with AI tools' }),
  ).toBeChecked();
  await expect
    .poll(() => JSON.parse(readFileSync(join(dataDirectory, 'settings.json'), 'utf8')) as unknown)
    .toMatchObject({ aiDesigns: true });
});

test('keeps the upscaling model and whether prepared listings upscale', async () => {
  const { window, dataDirectory } = launched;
  await window.getByRole('link', { name: 'Settings' }).click();
  const upscale = window.getByRole('switch', {
    name: 'Upscale low-resolution artwork when preparing listings',
  });

  await expect(upscale).not.toBeChecked();
  await upscale.click();
  await window.getByRole('combobox', { name: 'Model' }).click();
  await window.getByRole('option', { name: 'Photo' }).click();

  await expect(upscale).toBeChecked();
  await expect
    .poll(() => JSON.parse(readFileSync(join(dataDirectory, 'settings.json'), 'utf8')) as unknown)
    .toMatchObject({ upscaleModel: 'photo', autoUpscale: true });
});
