import { NextRequest, NextResponse } from 'next/server';
import { createWorkspaceMcpToken, listWorkspaceMcpTokens } from '@/lib/mcp/tokens';
import {
  getCurrentWorkspaceUserId,
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from '@/lib/services/workspace-access.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const userId = await getCurrentWorkspaceUserId();
    await requireWorkspaceAccess(workspaceId, userId);

    const tokens = await listWorkspaceMcpTokens(workspaceId);
    return NextResponse.json({ success: true, data: tokens });
  } catch (error) {
    return handleTokenRouteError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const userId = await getCurrentWorkspaceUserId();
    await requireWorkspaceAccess(workspaceId, userId);

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }

    const token = await createWorkspaceMcpToken({
      workspaceId,
      name,
      createdBy: userId,
    });

    return NextResponse.json({ success: true, data: token }, { status: 201 });
  } catch (error) {
    return handleTokenRouteError(error);
  }
}

function handleTokenRouteError(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500 }
  );
}
