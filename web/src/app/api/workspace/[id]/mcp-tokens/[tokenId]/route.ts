/**
 * Workspace MCP Tokens API - Single-token operations
 *
 * DELETE /api/workspace/[id]/mcp-tokens/[tokenId]   - Revoke an MCP token (idempotent)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from '@/lib/services/workspace-access.service';
import { revokeMcpToken } from '@/lib/mcp/tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpTokensApi');

interface RouteParams {
  params: Promise<{ id: string; tokenId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, tokenId } = await params;
  try {
    const ws = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    if (!ws) throw new WorkspaceAccessError(404, `Workspace ${workspaceId} not found`);
    await requireWorkspaceAccess(workspaceId, ws.ownerId);
    await revokeMcpToken(workspaceId, tokenId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof WorkspaceAccessError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    log.error('DELETE /api/workspace/[id]/mcp-tokens/[tokenId]', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
