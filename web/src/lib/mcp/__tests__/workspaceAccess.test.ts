import { afterEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  workspaceSession: {
    findUnique: vi.fn(),
  },
  workspaceParticipant: {
    findFirst: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

describe('requireWorkspaceAccess', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows workspace owners', async () => {
    const { requireWorkspaceAccess } = await import('@/lib/services/workspace-access.service');
    prismaMock.workspaceSession.findUnique.mockResolvedValue({ id: 'ws-1', ownerId: 'user-1' });

    await expect(requireWorkspaceAccess('ws-1', 'user-1')).resolves.toEqual({
      workspaceId: 'ws-1',
      userId: 'user-1',
      asOwner: true,
    });
    expect(prismaMock.workspaceParticipant.findFirst).not.toHaveBeenCalled();
  });

  it('allows workspace participants', async () => {
    const { requireWorkspaceAccess } = await import('@/lib/services/workspace-access.service');
    prismaMock.workspaceSession.findUnique.mockResolvedValue({ id: 'ws-1', ownerId: 'owner' });
    prismaMock.workspaceParticipant.findFirst.mockResolvedValue({ id: 'participant-1' });

    await expect(requireWorkspaceAccess('ws-1', 'user-1')).resolves.toEqual({
      workspaceId: 'ws-1',
      userId: 'user-1',
      asOwner: false,
    });
  });

  it('rejects strangers', async () => {
    const { requireWorkspaceAccess, WorkspaceAccessError } = await import('@/lib/services/workspace-access.service');
    prismaMock.workspaceSession.findUnique.mockResolvedValue({ id: 'ws-1', ownerId: 'owner' });
    prismaMock.workspaceParticipant.findFirst.mockResolvedValue(null);

    await expect(requireWorkspaceAccess('ws-1', 'user-1')).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(requireWorkspaceAccess('ws-1', 'user-1')).rejects.toMatchObject({ status: 403 });
  });

  it('returns 404 for missing workspaces', async () => {
    const { requireWorkspaceAccess } = await import('@/lib/services/workspace-access.service');
    prismaMock.workspaceSession.findUnique.mockResolvedValue(null);

    await expect(requireWorkspaceAccess('missing', 'user-1')).rejects.toMatchObject({ status: 404 });
  });
});
