import { NextRequest, NextResponse } from 'next/server';
import { revokeWorkspaceMcpToken } from '@/lib/mcp/tokens';
import {
  getCurrentWorkspaceUserId,
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from '@/lib/services/workspace-access.service';

interface RouteParams {
  params: Promise<{ id: string; tokenId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId, tokenId } = await params;
    const userId = await getCurrentWorkspaceUserId();
    await requireWorkspaceAccess(workspaceId, userId);
    await revokeWorkspaceMcpToken({ workspaceId, tokenId });

    return NextResponse.json({ success: true, data: { revoked: true } });
  } catch (error) {
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
}
