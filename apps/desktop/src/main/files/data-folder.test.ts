import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataPath, upscalerDirectory } from './data-folder.js';

describe('dataPath', () => {
  it('keeps every file in the data folder', () => {
    expect(dataPath('/data', 'database')).toBe(join('/data', 'catalog.db'));
    expect(dataPath('/data', 'downloads')).toBe(join('/data', 'downloads'));
  });
});

describe('upscalerDirectory', () => {
  const location = {
    resourcesPath: '/Applications/POD Pipeline.app/Contents/Resources',
    appPath: '/src/pod-pipeline/apps/desktop',
  };

  it('finds the engine among the resources of the installed app', () => {
    expect(upscalerDirectory({ ...location, packaged: true, platform: 'darwin' })).toBe(
      join(location.resourcesPath, 'upscaler'),
    );
  });

  it('finds the engine the fetch script put in a checkout, by system', () => {
    expect(upscalerDirectory({ ...location, packaged: false, platform: 'win32' })).toBe(
      join(location.appPath, 'resources', 'upscaler', 'win'),
    );
    expect(upscalerDirectory({ ...location, packaged: false, platform: 'linux' })).toBe(
      join(location.appPath, 'resources', 'upscaler', 'linux'),
    );
  });
});
