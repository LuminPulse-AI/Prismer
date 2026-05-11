import prisma from '@/lib/prisma';

export interface WorkspaceAccessContext {
  workspaceId: string;
  userId: string;
  asOwner: boolean;
}

export class WorkspaceAccessError extends Error {
  constructor(
    public readonly status: 403 | 404,
    message: string
  ) {
    super(message);
    this.name = 'WorkspaceAccessError';
  }
}

/**
 * Open-source workspace mode runs as one local user. Keep this in one place so
 * routes that later move to real auth do not each carry their own dev-user copy.
 */
export async function getCurrentWorkspaceUserId(): Promise<string> {
  let devUser = await prisma.user.findUnique({
    where: { id: 'dev-user' },
  });

  if (!devUser) {
    devUser = await prisma.user.create({
      data: {
        id: 'dev-user',
        email: process.env.DEV_USER_EMAIL || 'dev@localhost',
        name: 'Dev User',
      },
    });
  }

  return devUser.id;
}

export async function requireWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<WorkspaceAccessContext> {
  const workspace = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });

  if (!workspace) {
    throw new WorkspaceAccessError(404, 'Workspace not found');
  }

  if (workspace.ownerId === userId) {
    return { workspaceId, userId, asOwner: true };
  }

  const participant = await prisma.workspaceParticipant.findFirst({
    where: {
      workspaceId,
      userId,
    },
    select: { id: true },
  });

  if (participant) {
    return { workspaceId, userId, asOwner: false };
  }

  throw new WorkspaceAccessError(403, 'Workspace access denied');
}
