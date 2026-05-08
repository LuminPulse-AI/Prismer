/**
 * Workspace MCP Tokens API - Collection operations
 *
 * POST /api/workspace/[id]/mcp-tokens   - Create a new MCP token (returns plaintext once)
 * GET  /api/workspace/[id]/mcp-tokens   - List MCP tokens (no plaintext)
 *
 * Self-host single-user mode: caller is treated as the workspace owner.
 * Replace `resolveCallerUserId` with a NextAuth session lookup once auth is
 * fully wired through this route surface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from '@/lib/services/workspace-access.service';
import { createMcpToken, listMcpTokens } from '@/lib/mcp/tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpTokensApi');

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveCallerUserId(workspaceId: string): Promise<string> {
  const ws = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (!ws) throw new WorkspaceAccessError(404, `Workspace ${workspaceId} not found`);
  return ws.ownerId;
}

const CreateBody = z.object({ name: z.string().min(1).max(120) });

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;
  try {
    const userId = await resolveCallerUserId(workspaceId);
    await requireWorkspaceAccess(workspaceId, userId);
    const body = CreateBody.parse(await req.json());
    const token = await createMcpToken({ workspaceId, name: body.name, createdBy: userId });
    return NextResponse.json({ success: true, data: token }, { status: 201 });
  } catch (err) {
    return errorToResponse(err, 'POST /api/workspace/[id]/mcp-tokens');
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;
  try {
    const userId = await resolveCallerUserId(workspaceId);
    await requireWorkspaceAccess(workspaceId, userId);
    const tokens = await listMcpTokens(workspaceId);
    return NextResponse.json({ success: true, data: tokens });
  } catch (err) {
    return errorToResponse(err, 'GET /api/workspace/[id]/mcp-tokens');
  }
}

function errorToResponse(err: unknown, op: string): NextResponse {
  if (err instanceof WorkspaceAccessError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', details: err.issues },
      { status: 400 }
    );
  }
  log.error(op, { err: err instanceof Error ? err.message : String(err) });
  return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
}
