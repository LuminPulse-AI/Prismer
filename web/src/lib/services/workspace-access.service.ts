import prisma from '@/lib/prisma';

export interface WorkspaceAccessContext {
  workspaceId: string;
  userId: string;
  asOwner: boolean;
}

export class WorkspaceAccessError extends Error {
  override name = 'WorkspaceAccessError' as const;
  constructor(
    public status: 403 | 404,
    message: string
  ) {
    super(message);
  }
}

/**
 * Verify that the caller is permitted to act on the given workspace.
 *
 * Resolution order:
 *   1. Workspace must exist (else 404)
 *   2. Caller is the workspace owner -> asOwner: true
 *   3. Caller is a registered participant -> asOwner: false
 *   4. Otherwise -> 403
 *
 * Designed to be called from MCP token CRUD endpoints (and any future
 * workspace-scoped routes) so multi-user ACLs can plug in without ratcheting
 * each route. In current self-host single-user mode the caller is typically
 * the owner and this is effectively a pass-through.
 */
export async function requireWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<WorkspaceAccessContext> {
  const workspace = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });

  if (!workspace) {
    throw new WorkspaceAccessError(404, `Workspace ${workspaceId} not found`);
  }

  if (workspace.ownerId === userId) {
    return { workspaceId, userId, asOwner: true };
  }

  const participant = await prisma.workspaceParticipant.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });

  if (participant) {
    return { workspaceId, userId, asOwner: false };
  }

  throw new WorkspaceAccessError(403, `User ${userId} has no access to workspace ${workspaceId}`);
}
