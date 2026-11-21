import { isAbsolute, join } from 'node:path';
import { format } from 'node:util';
import { app, dialog, powerMonitor } from 'electron';
import { APP_DATA_FOLDER_NAME, DATA_DIRECTORY_VARIABLE } from '@pod/contracts';
import { pickLanguage } from './application/settings/settings-store.js';
import { registerAssetScheme } from './assets/asset-protocol.js';
import {
  MCP_SERVER_ARGUMENT,
  mcpLaunch,
  mcpServerEntry,
  runningAppImage,
} from './local-api/mcp-launch.js';
import { runMcpServer } from './lifecycle/mcp-server.js';
import { startDesktop, type Desktop } from './composition/start-desktop.js';
import { upscalerDirectory } from './files/data-folder.js';
import { fakeServiceRoute } from './composition/fake-service-route.js';
import { redact } from './shared/redact.js';
import { MainLog } from './files/main-log.js';
import { setPackagedApplicationMenu } from './window/application-menu.js';
import { rendererFile } from './window/main-window.js';

/** How long closing may take after a crash before the app ends anyway. */
const CRASH_EXIT_TIMEOUT_MS = 5_000;

/** Starts the window app: one instance, its data folder, crash handling and the desktop. */
function runDesktopApp(): void {
  // The data folder is named after the app; set it before any path is read.
  app.setName(APP_DATA_FOLDER_NAME);
  const dataDirectoryOverride = applyDataDirectoryOverride();
  if (dataDirectoryOverride === null) return;
  const mainLog = new MainLog(app.getPath('logs'));
  /** Resolves once the error is in the log, so the process may end right after. */
  const record = (error: unknown): Promise<void> => {
    console.error(redact(format(error)));
    return mainLog.write(error);
  };
  const log = (error: unknown): void => {
    void record(error);
  };
  let desktop: Desktop | undefined;
  let exiting = false;
  /** Closes everything once, then ends the process; later calls do nothing. */
  const exitAfterShutDown = (code = 0): void => {
    if (exiting) return;
    exiting = true;
    void (desktop?.shutDown() ?? Promise.resolve()).finally(() => {
      app.exit(code);
    });
  };
  handleCrashes(record, mainLog.path, exitAfterShutDown);
  process.on('unhandledRejection', log);

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  registerAssetScheme();
  app.on('second-instance', () => desktop?.focus());
  exitOnQuit(exitAfterShutDown);

  app
    .whenReady()
    .then(async () => {
      const options = desktopOptions(dataDirectoryOverride, log);
      // At once, so Electron's default menu with its developer tools never shows.
      options.showMenu?.(options.defaultSettings.language);
      desktop = await startDesktop(options);
    })
    .catch(async (error: unknown) => {
      await record(error);
      dialog.showErrorBox('POD Pipeline could not start', redact(String(error)));
      app.exit(1);
    });
}

/**
 * Lets tests and portable setups keep their data, and their log, apart from the user's own.
 * Null when the folder is not absolute, after telling the user and ending the app.
 */
function applyDataDirectoryOverride(): string | undefined | null {
  const override = process.env[DATA_DIRECTORY_VARIABLE] || undefined;
  if (override && !isAbsolute(override)) {
    dialog.showErrorBox(
      'POD Pipeline could not start',
      `${DATA_DIRECTORY_VARIABLE} must be an absolute path, not "${override}".`,
    );
    app.exit(1);
    return null;
  }
  if (override) {
    app.setPath('userData', override);
    app.setAppLogsPath(join(override, 'logs'));
  }
  return override;
}

function exitOnQuit(exitAfterShutDown: () => void): void {
  // Quitting again from `will-quit` is ignored, so the process exits once everything is closed.
  app.on('will-quit', (event) => {
    event.preventDefault();
    exitAfterShutDown();
  });
  // Shutting down the computer can skip `will-quit`.
  powerMonitor.on('shutdown', () => {
    exitAfterShutDown();
  });
}

/** The app may be in any state after an uncaught error, so it says so, closes what it can and ends. */
function handleCrashes(
  record: (error: unknown) => Promise<void>,
  logPath: string,
  exitAfterShutDown: (code: number) => void,
): void {
  let crashed = false;
  process.on('uncaughtException', (error) => {
    void record(error).then(() => {
      if (crashed) return;
      crashed = true;
      dialog.showErrorBox(
        'POD Pipeline stopped after an error',
        `${redact(String(error))}\n\nThe details are in ${logPath}.`,
      );
      setTimeout(() => {
        app.exit(1);
      }, CRASH_EXIT_TIMEOUT_MS).unref();
      exitAfterShutDown(1);
    });
  });
}

function desktopOptions(
  dataDirectoryOverride: string | undefined,
  log: (error: unknown) => void,
): Parameters<typeof startDesktop>[0] {
  return {
    dataDirectory: app.getPath('userData'),
    defaultSettings: {
      language: pickLanguage(app.getPreferredSystemLanguages()),
    },
    preloadPath: join(import.meta.dirname, '../preload/index.cjs'),
    rendererUrl: app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'],
    rendererFile: rendererFile(import.meta.dirname),
    log,
    mcpLaunch: () =>
      mcpLaunch({
        execPath: process.execPath,
        packaged: app.isPackaged,
        mainScript: join(import.meta.dirname, 'index.js'),
        appImage: runningAppImage(process.env, process.execPath),
        dataDirectoryOverride,
        outsideApplicationsFolder:
          process.platform === 'darwin' && app.isPackaged && !app.isInApplicationsFolder(),
      }),
    upscalerDirectory: upscalerDirectory({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
      platform: process.platform,
    }),
    fakeServices: fakeServiceRoute(process.env, app.isPackaged),
    showMenu: app.isPackaged
      ? (language) => {
          setPackagedApplicationMenu(process.platform, language);
        }
      : undefined,
  };
}

// MCP clients start the app with this argument; it serves them before anything of the window starts.
if (process.argv.includes(MCP_SERVER_ARGUMENT)) {
  await runMcpServer(
    mcpServerEntry({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      mainFolder: import.meta.dirname,
    }),
  );
} else {
  runDesktopApp();
}
