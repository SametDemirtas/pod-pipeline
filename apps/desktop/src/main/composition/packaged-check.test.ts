import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_DIRECTORY_VARIABLE, LOCAL_API_CONNECTION_FILE } from '@pod/contracts';

// The script runs before anything is built, so it keeps its own copies of these.
const SCRIPT = readFileSync(
  join(import.meta.dirname, '../../../../../scripts/check-packaged-app.ts'),
  'utf8',
);

describe('check-packaged-app', () => {
  it('names the data folder variable and the connection file as the contracts do', () => {
    expect(SCRIPT).toContain(`const DATA_DIRECTORY_VARIABLE = '${DATA_DIRECTORY_VARIABLE}';`);
    expect(SCRIPT).toContain(`const LOCAL_API_CONNECTION_FILE = '${LOCAL_API_CONNECTION_FILE}';`);
  });
});
