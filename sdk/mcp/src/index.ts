import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerContextLoad } from './tools/context-load.js';
import { registerContextSave } from './tools/context-save.js';
import { registerParse } from './tools/parse.js';
import { registerDiscover } from './tools/discover.js';
import { registerSendMessage } from './tools/send-message.js';
import { getApiKey } from './lib/client.js';

const server = new McpServer({
  name: 'prismer',
  version: '1.0.0',
});

registerContextLoad(server);
registerContextSave(server);
registerParse(server);
registerDiscover(server);
registerSendMessage(server);

async function main() {
  if (!getApiKey()) {
    console.error('[Prismer MCP] PRISMER_API_KEY environment variable is required.');
    console.error('[Prismer MCP] Get your key at https://prismer.cloud/dashboard');
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Prismer MCP] Server running on stdio');
}

main().catch((error) => {
  console.error('[Prismer MCP] Fatal error:', error);
  process.exit(1);
});
