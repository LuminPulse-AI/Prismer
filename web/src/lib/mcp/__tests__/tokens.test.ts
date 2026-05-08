import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '@/lib/prisma';
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
  validateMcpToken,
} from '@/lib/mcp/tokens';

describe('mcp/tokens', () => {
  let workspaceId: string;
  const ownerId = 'user-tokens-test';

  beforeEach(async () => {
    await prisma.workspaceMcpToken.deleteMany({});
    await prisma.workspaceSession.deleteMany({ where: { ownerId } });
    await prisma.user.upsert({
      where: { email: 'tokens-test@example.com' },
      update: { id: ownerId },
      create: { id: ownerId, email: 'tokens-test@example.com' },
    });
    const ws = await prisma.workspaceSession.create({
      data: { name: 'tokens-test', ownerId },
    });
    workspaceId = ws.id;
  });

  it('createMcpToken returns plaintext exactly once and stores only the hash', async () => {
    const result = await createMcpToken({
      workspaceId,
      name: 'CI bot',
      createdBy: ownerId,
    });

    expect(result.plaintext).toMatch(/^pmsk_[A-Za-z0-9_-]{40,}$/);
    expect(result.prefix).toMatch(/^pmsk_[A-Za-z0-9_-]{8}$/);
    expect(result.prefix.length).toBe(13);

    const row = await prisma.workspaceMcpToken.findUnique({ where: { id: result.id } });
    expect(row?.tokenHash).toBeDefined();
    expect(row?.tokenHash).not.toBe(result.plaintext);
    expect(row?.tokenHash.length).toBe(64);
  });

  it('listMcpTokens returns metadata without plaintext', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    const list = await listMcpTokens(workspaceId);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, prefix: created.prefix, name: 'A' });
    expect(list[0]).not.toHaveProperty('plaintext');
    expect(list[0]).not.toHaveProperty('tokenHash');
  });

  it('revokeMcpToken sets revokedAt and is idempotent', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    await revokeMcpToken(workspaceId, created.id);
    await revokeMcpToken(workspaceId, created.id);

    const row = await prisma.workspaceMcpToken.findUnique({ where: { id: created.id } });
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });

  it('validateMcpToken accepts valid token and rejects revoked', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    const ok = await validateMcpToken(created.plaintext, workspaceId);
    expect(ok).toMatchObject({ workspaceId, tokenId: created.id });

    await revokeMcpToken(workspaceId, created.id);
    await expect(validateMcpToken(created.plaintext, workspaceId)).rejects.toThrow(/revoked/i);
  });

  it('validateMcpToken rejects token bound to different workspace', async () => {
    const otherWs = await prisma.workspaceSession.create({
      data: { name: 'tokens-test-other', ownerId },
    });
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    await expect(validateMcpToken(created.plaintext, otherWs.id)).rejects.toThrow(/workspace/i);
  });

  it('validateMcpToken rejects expired token', async () => {
    const past = new Date(Date.now() - 60_000);
    const created = await createMcpToken({
      workspaceId,
      name: 'A',
      createdBy: ownerId,
      expiresAt: past,
    });

    await expect(validateMcpToken(created.plaintext, workspaceId)).rejects.toThrow(/expired/i);
  });

  it('validateMcpToken updates lastUsedAt on success (fire-and-forget)', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    await validateMcpToken(created.plaintext, workspaceId);
    await new Promise((r) => setTimeout(r, 50));

    const row = await prisma.workspaceMcpToken.findUnique({ where: { id: created.id } });
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });
});
