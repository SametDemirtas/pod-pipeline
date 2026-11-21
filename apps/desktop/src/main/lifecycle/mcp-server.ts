import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format } from 'node:util';
import { app } from 'electron';
import { APP_DATA_FOLDER_NAME } from '@pod/contracts';
import { redact } from '../shared/redact.js';

/**
 * Serves the bundled MCP server on this process's stdin and stdout, with no window,
 * dock icon or single-instance lock, so it runs beside the open app. Ends when the
 * client closes stdin, since an Electron process does not end on its own, and then
 * removes the scratch folder Chromium wrote to.
 */
export async function runMcpServer(entry: string): Promise<void> {
  // Chromium writes its own state there; it must not touch the running app's or another server's.
  const scratch = mkdtempSync(join(app.getPath('temp'), `${APP_DATA_FOLDER_NAME}-mcp-`));
  const exit = (code: number) => {
    removeScratch(scratch);
    app.exit(code);
  };
  const fail = (error: unknown) => {
    console.error(redact(format(error)));
    exit(1);
  };
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
  app.dock?.hide();
  app.disableHardwareAcceleration();
  app.setPath('userData', scratch);
  process.stdin.once('close', () => {
    exit(0);
  });
  await import(pathToFileURL(entry).href);
}

/** Best effort: on Windows a Chromium helper may still hold a file open. */
function removeScratch(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true });
  } catch {
    // The system clears its temporary folder in time.
  }
}
