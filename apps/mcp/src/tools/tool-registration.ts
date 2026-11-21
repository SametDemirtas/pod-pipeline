import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Registers one tool, or a group of them, that calls only the operations of `Api` it needs. */
export type ToolRegistration<Api> = (server: McpServer, api: Api) => void;

/** Runs the registrations in the order given, which is the order clients list the tools in. */
export function registerTools<Api>(
  server: McpServer,
  api: Api,
  tools: readonly ToolRegistration<NoInfer<Api>>[],
): void {
  for (const register of tools) register(server, api);
}
