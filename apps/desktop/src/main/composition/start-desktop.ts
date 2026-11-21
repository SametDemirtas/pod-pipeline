import { app, ipcMain, safeStorage } from 'electron';
import {
  BrowserMarketSearch,
  ETSY_MARKET_PAGES,
  isAllowedResearchUrl,
  isEtsyPage,
} from '@pod/adapter-etsy';
import { ImageHeaderInspector } from '@pod/adapter-fs';
import { IPC_EVENTS, type McpLaunchDto, type SettingsDto, type UiLanguage } from '@pod/contracts';
import { desktopOperations } from '../api/desktop-operations.js';
import type { ErrorLogger } from '../api/to-api-error.js';
import {
  handleAssetProtocol,
  nativeBitmapCodec,
  nativeThumbnailRenderer,
} from '../assets/asset-protocol.js';
import { pngThumbnailRenderer } from '../assets/png-thumbnail-renderer.js';
import { ThumbnailCache } from '../assets/thumbnail-cache.js';
import { registerIpc } from '../ipc/ipc-bridge.js';
import { openLocalAccess } from '../local-api/local-access.js';
import { keychainEncryption } from '../storage/keychain-encryption.js';
import { showClosingNotice } from '../window/closing-notice.js';
import { openClosingWindow } from '../window/closing-window.js';
import { lockDownDefaultSession } from '../window/default-session.js';
import { createMainWindow } from '../window/main-window.js';
import { openInBrowser } from '../window/open-in-browser.js';
import { renderPinPng } from '../window/pin-composer-window.js';
import { openResearchWindow } from '../window/research-window.js';
import { WindowBridge } from '../window/window-bridge.js';
import { createServices, type ServiceOptions } from './create-services.js';
import { withMenuLanguage } from './menu-language.js';
import { dataPath } from '../files/data-folder.js';
import type { FakeServiceRoute } from './fake-service-route.js';
import startPngWorkerThread from './png-worker?nodeWorker';
import { pngScaler, PNG_WORKER_LIMITS } from './services/upscale-providers.js';
import { createShutdown, serve } from '../lifecycle/shutdown.js';

export interface DesktopOptions {
  readonly dataDirectory: string;
  /** The window's language until the seller picks one. */
  readonly defaultSettings: Pick<SettingsDto, 'language'>;
  readonly preloadPath: string;
  /** Dev server URL in development; the built `index.html` otherwise. */
  readonly rendererUrl: string | undefined;
  readonly rendererFile: string;
  readonly log: ErrorLogger;
  /** How AI assistants start the MCP server that ships with the app. */
  readonly mcpLaunch: () => McpLaunchDto;
  /** Folder holding the upscaling engine and its models. */
  readonly upscalerDirectory: string;
  /** Development builds under test only: the fake services to use instead of the real ones. */
  readonly fakeServices?: FakeServiceRoute | undefined;
  /** Installed builds only: sets the app's menus, named in the seller's language. */
  readonly showMenu?: ((language: UiLanguage) => void) | undefined;
}

export interface Desktop {
  readonly focus: () => void;
  readonly shutDown: () => Promise<void>;
}

/** Wires the services to Electron: IPC, the asset protocol, the local API and the window. */
export async function startDesktop(options: DesktopOptions): Promise<Desktop> {
  const { dataDirectory, log } = options;
  const bridge = new WindowBridge();
  lockDownDefaultSession();
  const startPngWorker = () => startPngWorkerThread({ resourceLimits: PNG_WORKER_LIMITS });
  const thumbnails = new ThumbnailCache(
    dataPath(dataDirectory, 'thumbnails'),
    pngThumbnailRenderer({
      inspector: new ImageHeaderInspector(),
      scaler: pngScaler(dataDirectory, startPngWorker),
      other: nativeThumbnailRenderer,
      onFallback: log,
    }),
  );
  const services = await createServices(
    serviceOptions(options, bridge, { thumbnails, startPngWorker }),
  );
  const settings = options.showMenu
    ? await withMenuLanguage(services.settings, options.showMenu, options.defaultSettings.language)
    : services.settings;
  const shutdown = createShutdown({
    settings: services.settings,
    defaultSettings: options.defaultSettings,
    showNotice: (language) => showClosingNotice(() => openClosingWindow(language), log),
    log,
  });
  await serve(shutdown, {
    prepare: async () => {
      // Swept before any is served, so a thumbnail made meanwhile is never taken for a leftover.
      await services
        .assetKeys()
        .then((keys) => thumbnails.removeAllBut(keys))
        .catch(log);
      handleAssetProtocol({ pathOf: services.assetPath, thumbnails });
      registerIpc(
        ipcMain,
        desktopOperations({ ...services, settings, mcpLaunch: options.mcpLaunch }),
        {
          isTrustedSender: (event) => bridge.isTrustedSender(event),
          isClosing: shutdown.isClosing,
          log,
        },
      );
    },
    openLocalAccess: () => openLocalAccess(dataDirectory, services.catalog, log),
    start: () => {
      services.startSchedules();
      openWindow(options, bridge, shutdown.shutDown);
    },
    closeServices: () => services.close(),
  });
  return {
    focus: () => {
      bridge.focus();
    },
    shutDown: shutdown.shutDown,
  };
}

function serviceOptions(
  options: DesktopOptions,
  bridge: WindowBridge,
  parts: Pick<ServiceOptions, 'thumbnails' | 'startPngWorker'>,
): ServiceOptions {
  const fake = options.fakeServices;
  return {
    ...parts,
    dataDirectory: options.dataDirectory,
    defaultSettings: options.defaultSettings,
    encryption: fake?.encryption ?? keychainEncryption(safeStorage, process.platform),
    openExternal: fake?.openExternal ?? openInBrowser,
    logError: options.log,
    ...(fake ? { fetch: fake.fetch } : {}),
    marketSearch: new BrowserMarketSearch({
      openPage: (market) =>
        openResearchWindow(market, {
          acceptLanguage: ETSY_MARKET_PAGES[market.region].acceptLanguage,
          isAllowedUrl: isAllowedResearchUrl,
          isEtsyPage,
        }),
    }),
    renderPin: renderPinPng,
    bitmapCodec: nativeBitmapCodec,
    pickFolder: () => bridge.pickFolder(),
    pickKeywordFile: () => bridge.pickKeywordFile(),
    pickImageFile: () => bridge.pickImageFile(),
    pickSavePath: (fileName) => bridge.pickSavePath(fileName, app.getPath('downloads')),
    upscalerDirectory: options.upscalerDirectory,
    events: {
      importProgress: (progress) => {
        bridge.send(IPC_EVENTS.importProgress, progress);
      },
      catalogChanged: () => {
        bridge.send(IPC_EVENTS.catalogChanged);
      },
      batchChanged: (status) => {
        bridge.send(IPC_EVENTS.batchChanged, status);
      },
      upscaleProgress: (progress) => {
        bridge.send(IPC_EVENTS.upscaleProgress, progress);
      },
    },
  };
}

function openWindow(
  options: DesktopOptions,
  bridge: WindowBridge,
  shutDown: () => Promise<void>,
): void {
  const window = createMainWindow({ ...options, openExternal: openInBrowser });
  // Hidden research or pin windows would keep the app running, so closing this one quits.
  window.on('closed', () => {
    app.quit();
  });
  // Logging off on Windows ends the session without `will-quit`.
  window.on('session-end', () => void shutDown());
  bridge.attach(window);
}
