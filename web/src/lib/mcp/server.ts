import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWorkspaceTools } from './tools';
import type { WorkspaceMcpToolContext } from './tools/context';

export function createWorkspaceMcpServer(context: WorkspaceMcpToolContext): McpServer {
  const server = new McpServer(
    {
      name: 'prismer-workspace',
      version: '0.1.0',
    },
    {
      instructions: [
        'Prismer workspace tools enqueue UI directives and return after the directive is accepted.',
        'The browser applies the update asynchronously through its existing directive stream.',
      ].join('\n'),
    }
  );

  registerWorkspaceTools(server, context);
  return server;
}
