import { homedir } from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageJson from '../package.json' with { type: 'json' };
import { dataDirectory, readConnection } from './connection.js';
import { httpCatalogApi } from './http-catalog-api.js';
import { registerAppTools } from './tools/index.js';

const directory = dataDirectory({
  platform: process.platform,
  home: homedir(),
  variables: process.env,
});
const server = new McpServer({ name: 'pod-pipeline', version: packageJson.version });
registerAppTools(
  server,
  httpCatalogApi(() => readConnection(directory)),
);
await server.connect(new StdioServerTransport());
