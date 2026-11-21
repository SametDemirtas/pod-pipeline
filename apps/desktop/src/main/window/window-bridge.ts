import {
  dialog,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import { join } from 'node:path';
import { isFromFrame } from '../ipc/trusted-sender.js';

/** Main-process helpers that act on whichever app window is currently open. */
export class WindowBridge {
  private window: BrowserWindow | undefined;

  attach(window: BrowserWindow): void {
    this.window = window;
    window.on('closed', () => {
      this.window = undefined;
    });
  }

  focus(): void {
    if (this.window?.isMinimized()) this.window.restore();
    this.window?.focus();
  }

  /** Tells the window of a change; a window being torn down hears nothing. */
  send(channel: string, payload?: unknown): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(channel, payload);
  }

  /** True only for requests from the app window's own top-level frame. */
  isTrustedSender(event: unknown): boolean {
    return isFromFrame(event, this.window?.webContents.mainFrame);
  }

  pickFolder(): Promise<string | null> {
    return this.pick({ properties: ['openDirectory'] });
  }

  /** A CSV file as keyword tools such as eRank export it. */
  pickKeywordFile(): Promise<string | null> {
    return this.pick({
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv', 'tsv', 'txt'] }],
    });
  }

  /** A photo whose style a scene may take. */
  pickImageFile(): Promise<string | null> {
    return this.pick({
      properties: ['openFile'],
      filters: [{ name: 'PNG or JPEG', extensions: ['png', 'jpg', 'jpeg'] }],
    });
  }

  /** Where to save a copy of a photo, starting from the Downloads folder; `null` when cancelled. */
  async pickSavePath(fileName: string, downloads: string): Promise<string | null> {
    const options: SaveDialogOptions = { defaultPath: join(downloads, fileName) };
    const result = this.window
      ? await dialog.showSaveDialog(this.window, options)
      : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  }

  private async pick(options: OpenDialogOptions): Promise<string | null> {
    const result = this.window
      ? await dialog.showOpenDialog(this.window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }
}
