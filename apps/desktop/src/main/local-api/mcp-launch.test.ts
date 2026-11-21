import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MCP_SERVER_ARGUMENT, mcpLaunch, mcpServerEntry, runningAppImage } from './mcp-launch.js';

const base = {
  execPath: '/Applications/POD Pipeline.app/Contents/MacOS/POD Pipeline',
  mainScript: '/src/pod-pipeline/apps/desktop/out/main/index.js',
  appImage: undefined,
  dataDirectoryOverride: undefined,
  outsideApplicationsFolder: false,
};

describe('mcpLaunch', () => {
  it('starts the installed app itself as the MCP server', () => {
    expect(mcpLaunch({ ...base, packaged: true })).toEqual({
      command: base.execPath,
      args: [MCP_SERVER_ARGUMENT],
      env: {},
      outsideApplicationsFolder: false,
    });
  });

  it('names the AppImage file, not its temporary mount, on Linux', () => {
    const launch = mcpLaunch({
      ...base,
      packaged: true,
      execPath: '/tmp/.mount_PODPipXYZ/pod-pipeline',
      appImage: '/home/me/Apps/POD Pipeline.AppImage',
    });

    expect(launch.command).toBe('/home/me/Apps/POD Pipeline.AppImage');
    expect(launch.args).toEqual([MCP_SERVER_ARGUMENT]);
  });

  it('passes on that the app runs from outside Applications', () => {
    expect(
      mcpLaunch({ ...base, packaged: true, outsideApplicationsFolder: true })
        .outsideApplicationsFolder,
    ).toBe(true);
  });

  it('runs the built main script of the checkout in development, with the chosen data folder', () => {
    expect(
      mcpLaunch({ ...base, packaged: false, appImage: '/ignored', dataDirectoryOverride: '/data' }),
    ).toEqual({
      command: base.execPath,
      args: [base.mainScript, MCP_SERVER_ARGUMENT],
      env: { POD_DATA_DIR: '/data' },
      outsideApplicationsFolder: false,
    });
  });
});

describe('runningAppImage', () => {
  const file = '/home/me/Apps/POD Pipeline.AppImage';
  const mount = join('/tmp', '.mount_PODPipXYZ');
  const execPath = join(mount, 'pod-pipeline');

  it('names the AppImage the executable was mounted from', () => {
    expect(runningAppImage({ APPIMAGE: file, APPDIR: mount }, execPath)).toBe(file);
  });

  it('ignores an AppImage variable without the mount the runtime sets', () => {
    expect(runningAppImage({ APPIMAGE: file }, execPath)).toBeUndefined();
  });

  it('ignores an AppImage variable inherited by an app installed elsewhere', () => {
    expect(
      runningAppImage({ APPIMAGE: file, APPDIR: mount }, join('/opt', 'pod-pipeline', 'pod')),
    ).toBeUndefined();
    expect(
      runningAppImage({ APPIMAGE: file, APPDIR: mount }, `${mount}-other/pod`),
    ).toBeUndefined();
  });
});

describe('mcpServerEntry', () => {
  const folders = {
    resourcesPath: '/Applications/POD Pipeline.app/Contents/Resources',
    mainFolder: '/src/pod-pipeline/apps/desktop/out/main',
  };

  it('loads the server packaged with the app', () => {
    expect(mcpServerEntry({ ...folders, packaged: true })).toBe(
      join(folders.resourcesPath, 'mcp', 'index.js'),
    );
  });

  it('loads the built server of the checkout in development', () => {
    expect(mcpServerEntry({ ...folders, packaged: false })).toBe(
      join('/src/pod-pipeline/apps', 'mcp', 'dist', 'index.js'),
    );
  });
});
