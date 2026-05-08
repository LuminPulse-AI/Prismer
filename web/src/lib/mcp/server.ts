import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTools, type ToolContext } from '@/lib/mcp/tools';

export function createMcpServer(ctx: ToolContext): Server {
  const server = new Server(
    { name: 'prismer-workspace', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );
  registerTools(server, ctx);
  return server;
}
