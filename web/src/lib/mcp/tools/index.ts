import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@/lib/logger';
import { toolError } from '../errors';
import type { WorkspaceMcpToolContext } from './context';
import { loadPdfInputSchema, loadPdfTool } from './load_pdf';
import { switchComponentInputSchema, switchComponentTool } from './switch_component';
import { updateNotesInputSchema, updateNotesTool } from './update_notes';

const log = createLogger('MCPTools');

export function registerWorkspaceTools(
  server: McpServer,
  context: WorkspaceMcpToolContext
): void {
  server.registerTool(
    'switch_component',
    {
      title: 'Switch Component',
      description: 'Switch the active Prismer workspace editor component.',
      inputSchema: switchComponentInputSchema,
    },
    async (input) => withToolLogging(context, 'switch_component', () => switchComponentTool(context, input))
  );

  server.registerTool(
    'update_notes',
    {
      title: 'Update Notes',
      description: 'Replace the workspace research notes content.',
      inputSchema: updateNotesInputSchema,
    },
    async (input) => withToolLogging(context, 'update_notes', () => updateNotesTool(context, input))
  );

  server.registerTool(
    'load_pdf',
    {
      title: 'Load PDF',
      description: 'Open a PDF in the workspace PDF reader from an asset id or URL.',
      inputSchema: loadPdfInputSchema,
    },
    async (input) => withToolLogging(context, 'load_pdf', () => loadPdfTool(context, input))
  );
}

async function withToolLogging(
  context: WorkspaceMcpToolContext,
  tool: string,
  operation: () => Promise<ReturnType<typeof toolError> | { content: Array<{ type: 'text'; text: string }> }>
) {
  const start = Date.now();
  try {
    const result = await operation();
    log.info('MCP tool completed', {
      workspaceId: context.workspaceId,
      tokenPrefix: context.tokenPrefix,
      tool,
      durationMs: Date.now() - start,
      status: 'ok',
    });
    return result;
  } catch (error) {
    const result = toolError(error instanceof Error ? error : new Error(String(error)));
    log.warn('MCP tool failed', {
      workspaceId: context.workspaceId,
      tokenPrefix: context.tokenPrefix,
      tool,
      durationMs: Date.now() - start,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
}
