import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const findUnique = vi.fn();
  const findUniqueParticipant = vi.fn();
  const client = {
    workspaceSession: { findUnique },
    workspaceParticipant: { findUnique: findUniqueParticipant },
  };
  return {
    default: client,
    prisma: client,
  };
});

import prisma from '@/lib/prisma';
import { requireWorkspaceAccess } from '@/lib/services/workspace-access.service';

const mockedWorkspace = prisma.workspaceSession.findUnique as ReturnType<typeof vi.fn>;
const mockedParticipant = prisma.workspaceParticipant.findUnique as ReturnType<typeof vi.fn>;

describe('requireWorkspaceAccess', () => {
  beforeEach(() => {
    mockedWorkspace.mockReset();
    mockedParticipant.mockReset();
  });

  it('returns asOwner=true when caller is the workspace owner', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'user1' });
    const ctx = await requireWorkspaceAccess('ws1', 'user1');
    expect(ctx).toEqual({ workspaceId: 'ws1', userId: 'user1', asOwner: true });
  });

  it('returns asOwner=false when caller is a participant', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'other' });
    mockedParticipant.mockResolvedValueOnce({ id: 'p1' });
    const ctx = await requireWorkspaceAccess('ws1', 'user2');
    expect(ctx).toEqual({ workspaceId: 'ws1', userId: 'user2', asOwner: false });
  });

  it('throws WorkspaceAccessError(404) when workspace does not exist', async () => {
    mockedWorkspace.mockResolvedValueOnce(null);
    await expect(requireWorkspaceAccess('missing', 'user1')).rejects.toMatchObject({
      name: 'WorkspaceAccessError',
      status: 404,
    });
  });

  it('throws WorkspaceAccessError(403) when caller is neither owner nor participant', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'other' });
    mockedParticipant.mockResolvedValueOnce(null);
    await expect(requireWorkspaceAccess('ws1', 'stranger')).rejects.toMatchObject({
      name: 'WorkspaceAccessError',
      status: 403,
    });
  });

  it('throws WorkspaceAccessError(403) when userId is empty string (never coincidentally passes)', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'real-owner' });
    mockedParticipant.mockResolvedValueOnce(null);
    await expect(requireWorkspaceAccess('ws1', '')).rejects.toMatchObject({
      name: 'WorkspaceAccessError',
      status: 403,
    });
  });

  it('returns asOwner=true short-circuit without checking participants when caller is owner', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'user1' });
    const ctx = await requireWorkspaceAccess('ws1', 'user1');
    expect(ctx).toEqual({ workspaceId: 'ws1', userId: 'user1', asOwner: true });
    expect(mockedParticipant).not.toHaveBeenCalled();
  });
});
