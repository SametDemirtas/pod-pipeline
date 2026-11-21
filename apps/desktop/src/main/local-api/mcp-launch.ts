import { join, sep } from 'node:path';
import { DATA_DIRECTORY_VARIABLE, type McpLaunchDto } from '@pod/contracts';

/** The argument that starts the app as its bundled MCP server instead of the window. */
export const MCP_SERVER_ARGUMENT = '--mcp-server';

export interface McpLaunchOptions {
  /** The app's executable, which runs the server when given `MCP_SERVER_ARGUMENT`. */
  readonly execPath: string;
  readonly packaged: boolean;
  /** The built main script; a development Electron needs it to know which app to run. */
  readonly mainScript: string;
  /** The AppImage file on Linux; `execPath` lies in a mount that goes away when the app quits. */
  readonly appImage: string | undefined;
  /** Set when the app keeps its data in a folder of the user's choice. */
  readonly dataDirectoryOverride: string | undefined;
  /** True on macOS when the app runs from outside Applications, where its path may not last. */
  readonly outsideApplicationsFolder: boolean;
}

/**
 * The AppImage file this process runs from. Any program may set `APPIMAGE`, so it
 * counts only when the executable lies inside the mount the AppImage runtime names.
 */
export function runningAppImage(
  env: Readonly<Record<string, string | undefined>>,
  execPath: string,
): string | undefined {
  const { APPIMAGE: appImage, APPDIR: mount } = env;
  if (!appImage || !mount) return undefined;
  return execPath.startsWith(mount.endsWith(sep) ? mount : `${mount}${sep}`) ? appImage : undefined;
}

/** The MCP server ships with the app and runs on its runtime, so no Node install is needed. */
export function mcpLaunch(options: McpLaunchOptions): McpLaunchDto {
  return {
    command: options.packaged ? (options.appImage ?? options.execPath) : options.execPath,
    args: options.packaged ? [MCP_SERVER_ARGUMENT] : [options.mainScript, MCP_SERVER_ARGUMENT],
    env: options.dataDirectoryOverride
      ? { [DATA_DIRECTORY_VARIABLE]: options.dataDirectoryOverride }
      : {},
    outsideApplicationsFolder: options.outsideApplicationsFolder,
  };
}

export interface McpServerEntryOptions {
  readonly packaged: boolean;
  /** Where packaged resources live; `process.resourcesPath` in the app. */
  readonly resourcesPath: string;
  /** The folder of the built main script, `apps/desktop/out/main` in a checkout. */
  readonly mainFolder: string;
}

/** The bundled MCP server: a packaged resource, or the built server of the checkout. */
export function mcpServerEntry(options: McpServerEntryOptions): string {
  return options.packaged
    ? join(options.resourcesPath, 'mcp', 'index.js')
    : join(options.mainFolder, '..', '..', '..', 'mcp', 'dist', 'index.js');
}
