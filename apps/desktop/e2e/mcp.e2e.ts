import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from '@playwright/test';
import { png } from '@pod/adapter-fs/testing';
import { IPC_CHANNELS, LOCAL_API_CONNECTION_FILE, type McpLaunchDto } from '@pod/contracts';
import { invoke } from './fake-shop.js';
import { launchApp, removeFolder, type LaunchedApp } from './launch-app.js';

let launched: LaunchedApp;
let client: Client;
let designs: string;

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as { text: string }[])[0]?.text ?? '';
}

test.beforeEach(async () => {
  designs = mkdtempSync(join(tmpdir(), 'pod-mcp-designs-'));
  mkdirSync(join(designs, '07. Snowy Night'));
  writeFileSync(join(designs, '07. Snowy Night', 'Mug.png'), png(400, 170, 120));
  launched = await launchApp();
  // Started exactly as Settings tells the user's assistant to start it.
  const launch = await invoke<McpLaunchDto>(launched.window, IPC_CHANNELS.getMcpLaunch);
  client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: launch.command,
      args: [...launch.args],
      env: { ...inheritedEnvironment(), ...launch.env },
    }),
  );
});

/** The test's own variables, without the one that would make Electron run as plain Node. */
function inheritedEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

test.afterEach(async () => {
  try {
    await client.close();
    await launched.close();
  } finally {
    removeFolder(designs);
  }
});

/** Approves `folder` the way a user does: by choosing it in the import dialog. */
async function approveInWindow(folder: string): Promise<void> {
  const { window } = launched;
  await launched.answerOpenDialog(folder);
  await window.getByRole('button', { name: 'Import designs' }).click();
  await window.getByRole('button', { name: 'Choose folder' }).click();
  // The dialog stays open while it checks the folder, so wait for the result first.
  await expect(window.getByText('Review what will change')).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(window.getByRole('dialog')).toBeHidden();
}

test('an assistant imports from a folder the user approved, and the window updates', async () => {
  const refused = await client.callTool({ name: 'preview_import', arguments: { folder: designs } });
  expect(refused.isError).toBe(true);
  expect(textOf(refused)).toContain('IMPORT_FOLDER_NOT_APPROVED');

  await approveInWindow(designs);
  const folders = await client.callTool({ name: 'list_import_folders', arguments: {} });
  expect(folders.structuredContent).toMatchObject({ folders: [expect.any(String)] });

  const preview = await client.callTool({ name: 'preview_import', arguments: { folder: designs } });
  const { fingerprint, counts } = preview.structuredContent as {
    fingerprint: string;
    counts: { new: number };
  };
  expect(counts.new).toBe(1);

  const result = await client.callTool({
    name: 'run_import',
    arguments: { folder: designs, fingerprint },
  });
  expect(result.structuredContent).toMatchObject({ created: ['07-mug'] });

  const listed = await client.callTool({ name: 'list_designs', arguments: { search: 'snowy' } });
  expect(listed.structuredContent).toMatchObject({ items: [{ designKey: '07-mug' }], total: 1 });
  await expect(launched.window.getByText('Snowy Night')).toBeVisible();
});

test('lets an assistant read how far preparing listings got, but not start it', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);

  expect(names).toContain('get_batch_status');
  expect(names.filter((name) => /batch/.test(name))).toEqual(['get_batch_status']);
  const status = await client.callTool({ name: 'get_batch_status', arguments: {} });
  expect(status.structuredContent).toEqual({ job: null });
});

test('withdraws the connection on quit, so the assistant hears the app is closed', async () => {
  await launched.quit();

  expect(existsSync(join(launched.dataDirectory, LOCAL_API_CONNECTION_FILE))).toBe(false);
  const result = await client.callTool({ name: 'list_product_families', arguments: {} });
  expect(result.isError).toBe(true);
  expect(textOf(result)).toContain('POD Pipeline is not running');
});
