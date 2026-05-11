import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { getRemoteUserId } from '@/lib/services/workspace.service';

const log = createLogger('NotesService');

export interface UpsertWorkspaceNoteInput {
  workspaceId: string;
  content: string;
  assetId?: number | null;
}

export interface UpsertWorkspaceNoteResult {
  assetId: number;
}

function parseSettings(settings: string | null): Record<string, unknown> {
  if (!settings) return {};

  try {
    const parsed = JSON.parse(settings);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export async function upsertWorkspaceNote(
  input: UpsertWorkspaceNoteInput
): Promise<UpsertWorkspaceNoteResult> {
  const { workspaceId, content } = input;
  const workspace = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { settings: true, name: true },
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const settings = parseSettings(workspace.settings);
  const userId = getRemoteUserId();
  const requestedAssetId = input.assetId ?? asPositiveInteger(settings.notesAssetId);
  const { assetService } = await import('@/lib/services/asset.service');

  if (requestedAssetId) {
    const updated = await assetService.update(requestedAssetId, userId, { content });
    if (updated) {
      if (settings.notesAssetId !== requestedAssetId) {
        await prisma.workspaceSession.update({
          where: { id: workspaceId },
          data: {
            settings: JSON.stringify({ ...settings, notesAssetId: requestedAssetId }),
          },
        });
      }

      log.debug('Notes updated', {
        workspaceId,
        assetId: requestedAssetId,
        contentLength: content.length,
      });

      return { assetId: requestedAssetId };
    }
  }

  const asset = await assetService.create({
    userId,
    assetType: 'note',
    title: `${workspace.name || 'Workspace'} - Research Notes`,
    content,
    noteType: 'summary',
    metadata: {
      sourceId: `workspace:${workspaceId}`,
    },
  });

  const nextSettings = { ...settings, notesAssetId: asset.id };
  await prisma.workspaceSession.update({
    where: { id: workspaceId },
    data: { settings: JSON.stringify(nextSettings) },
  });

  const collectionId = asPositiveInteger(settings.collectionId);
  if (collectionId) {
    const { collectionService } = await import('@/lib/services/collection.service');
    await collectionService.addAsset(collectionId, asset.id, userId);
    log.info('Notes asset linked to collection', {
      workspaceId,
      assetId: asset.id,
      collectionId,
    });
  }

  return { assetId: asset.id };
}
