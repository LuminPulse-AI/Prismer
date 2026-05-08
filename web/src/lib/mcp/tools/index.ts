import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { TokenContext } from '@/lib/mcp/tokens';

export interface ToolContext {
  workspaceId: string;
  token: TokenContext;
}

/**
 * Registers all Phase 1 tools on the MCP server.
 * Filled in during Phase 6 (one task per tool).
 */
export function registerTools(_server: Server, _ctx: ToolContext): void {
  // Phase 6 will register: switch_component, update_notes, load_pdf
}
