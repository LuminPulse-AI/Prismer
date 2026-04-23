/**
 * Workspace File Sync Service
 *
 * Downloads files from the container and stores them in the local
 * asset library, then links them to the workspace collection.
 *
 * Triggered asynchronously by the directive receiver when a directive
 * contains file references (e.g., LATEX_COMPILE_COMPLETE with pdfUrl).
 */

import { proxyToContainer } from '@/lib/container/client';
import { storeLocalAssetBuffer } from '@/lib/assets/storage';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

const log = createLogger('WorkspaceFileSync');

interface FileSyncResult {
  success: boolean;
  assetId?: number;
  storageKey?: string;
  error?: string;
}

interface FileSyncOptions {
  workspaceId: string;
  title: string;
  assetType: 'paper' | 'note';
  contentType?: string;
}

/**
 * Download a file from the container and sync it to the local asset store.
 *
 * @param agentId - Agent instance ID (for container proxy routing)
 * @param service - Container service ('latex' | 'jupyter')
 * @param containerPath - Path within the container service
 * @param options - Workspace and asset metadata
 */
export async function syncFileFromContainer(
  agentId: string,
  service: 'latex' | 'jupyter',
  containerPath: string,
  options: FileSyncOptions
): Promise<FileSyncResult> {
  try {
    log.info('Starting file sync', {
      agentId,
      service,
      containerPath,
      workspaceId: options.workspaceId,
    });

    // Step 1: Download from container via proxy
    const result = await proxyToContainer(agentId, service, containerPath, {
      method: 'GET',
    });

    if (!result.ok) {
      throw new Error(`Container returned ${result.status}: ${result.statusText}`);
    }

    // Step 2: Persist locally
    const filename = containerPath.split('/').pop() || 'file';

    const bodyBuffer = result.body instanceof ArrayBuffer
      ? Buffer.from(result.body)
      : Buffer.from(result.body as string, 'binary');

    const storedFile = await storeLocalAssetBuffer({
      buffer: bodyBuffer,
      fileName: filename,
      mimeType: options.contentType || result.contentType || 'application/octet-stream',
      workspaceId: options.workspaceId,
      category: service,
    });

    log.info('File stored locally', { storageKey: storedFile.storageKey, size: bodyBuffer.length });

    // Step 3: Create asset record
    const { assetService } = await import('./asset.service');
    const { getRemoteUserId } = await import('./workspace.service');
    const userId = getRemoteUserId();
    const asset = await assetService.create({
      userId,
      assetType: options.assetType,
      title: options.title,
      source: 'upload',
      storageProvider: 'local',
      storageKey: storedFile.storageKey,
      fileName: storedFile.fileName,
      mimeType: storedFile.mimeType,
      metadata: {
        sourceId: `workspace:${options.workspaceId}`,
        fileName: filename,
      },
    });

    // Step 4: Link to workspace collection
    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: options.workspaceId },
      select: { settings: true },
    });

    if (workspace?.settings) {
      const settings = JSON.parse(workspace.settings as string);
      if (settings.collectionId) {
        const { collectionService } = await import('./collection.service');
        await collectionService.addAsset(settings.collectionId, asset.id, userId);
        log.info('Asset linked to workspace collection', {
          assetId: asset.id,
          collectionId: settings.collectionId,
        });
      }
    }

    log.info('File sync complete', { agentId, storageKey: storedFile.storageKey, assetId: asset.id });
    return { success: true, assetId: asset.id, storageKey: storedFile.storageKey };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('File sync failed', {
      agentId,
      service,
      containerPath,
      error: errorMsg,
    });
    return { success: false, error: errorMsg };
  }
}
