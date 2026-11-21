import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CatalogApi } from '@pod/contracts/client';
import { registerBatchTools } from './batch-tools.js';
import { registerCatalogTools } from './catalog-tools.js';
import { registerImportTools } from './import-tools.js';
import { registerListingTools } from './listing-tools.js';
import { registerPinTools } from './pin-tools.js';
import { registerPrintTools } from './print-tools.js';
import { registerResearchTools } from './research-tools.js';
import { registerTools } from './tool-registration.js';

/** Exposes the desktop app's catalog as MCP tools, in the order clients list them. */
export function registerAppTools(server: McpServer, api: CatalogApi): void {
  registerTools(server, api, [
    registerCatalogTools,
    registerImportTools,
    registerPrintTools,
    registerListingTools,
    registerResearchTools,
    registerPinTools,
    registerBatchTools,
  ]);
}
