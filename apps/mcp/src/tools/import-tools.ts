import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CatalogApi } from '@pod/contracts/client';
import { readOnly, writes } from '../annotations.js';
import { withProgress } from '../progress.js';
import { respond } from '../respond.js';
import { inputs, outputs } from '../schemas.js';
import { registerTools } from './tool-registration.js';

const FOLDER_RULE =
  'Only folders the user chose once in the app (Import designs, Choose folder) and folders ' +
  'inside them are allowed; list_import_folders shows them.';

function listImportFolders(server: McpServer, api: Pick<CatalogApi, 'listImportFolders'>): void {
  server.registerTool(
    'list_import_folders',
    {
      title: 'List import folders',
      description: `Folders designs may be imported from. ${FOLDER_RULE}`,
      outputSchema: outputs.folders,
      annotations: readOnly(false),
    },
    () => respond(api.listImportFolders().then((folders) => ({ folders }))),
  );
}

function previewImport(server: McpServer, api: Pick<CatalogApi, 'previewImport'>): void {
  server.registerTool(
    'preview_import',
    {
      title: 'Preview import',
      description:
        'Checks a folder of artwork without changing anything: which designs are new, ' +
        'changed or already imported, and which files are skipped and why. Show the result ' +
        `to the user before calling run_import. ${FOLDER_RULE}`,
      inputSchema: { folder: inputs.folder.describe('Absolute path of the folder') },
      outputSchema: outputs.preview,
      annotations: readOnly(false),
    },
    ({ folder }, extra) =>
      respond(
        withProgress(extra, 'Still reading the folder', api.previewImport({ rootPath: folder })),
      ),
  );
}

function runImport(server: McpServer, api: Pick<CatalogApi, 'runImport'>): void {
  server.registerTool(
    'run_import',
    {
      title: 'Run import',
      description:
        'Imports the designs a preview_import call reported. Pass the same folder and the ' +
        'fingerprint it returned; the import is refused if anything changed since, and ' +
        'repeating it changes nothing.',
      inputSchema: {
        folder: inputs.folder.describe('Same folder as in preview_import'),
        fingerprint: inputs.fingerprint.describe('fingerprint returned by preview_import'),
      },
      outputSchema: outputs.importResult,
      annotations: writes({ idempotent: true, destructive: false, openWorld: false }),
    },
    ({ folder, fingerprint }, extra) =>
      respond(
        withProgress(
          extra,
          'Still importing the designs',
          api.runImport({ rootPath: folder, fingerprint }),
        ),
      ),
  );
}

/** Importing artwork from the folders the user allowed. */
export function registerImportTools(
  server: McpServer,
  api: Pick<CatalogApi, 'listImportFolders' | 'previewImport' | 'runImport'>,
): void {
  registerTools(server, api, [listImportFolders, previewImport, runImport]);
}
