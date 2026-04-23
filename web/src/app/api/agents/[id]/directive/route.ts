/**
 * Directive Receiver API
 *
 * POST /api/agents/:id/directive
 *
 * Receives UI directives from the container plugin (prismer-workspace skill)
 * during agent tool execution. Directives are enqueued for SSE delivery
 * to the frontend.
 *
 * Request body: { type: string, payload: Record<string, unknown>, timestamp?: number }
 *
 * The plugin calls this endpoint from within the container during tool
 * execution (e.g., latex_compile auto-switches UI to latex-editor before
 * the compile starts). See docker/plugin/prismer-workspace/src/tools.ts.
 *
 * File sync triggers: All file-bearing directives automatically trigger
 * either DB upsert (source files) or local asset creation (compiled output).
 * See FILE_SYNC_TRIGGERS and AGENT_LOOP_PLAN.md Phase 0.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { storeLocalAssetBuffer } from '@/lib/assets/storage';
import { directiveQueue } from '@/lib/directive/queue';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

const log = createLogger('DirectiveAPI');

// ============================================================
// File Sync Trigger Configuration
// ============================================================

interface FileSyncConfig {
  /** Sync target: 'asset' stores a library asset; 'workspace-files' upserts to WorkspaceFile DB */
  target: 'asset' | 'workspace-files';
  service: 'latex' | 'jupyter' | 'code' | 'gallery';
  fileType: string;
  /** For asset target: URL to download from container */
  url?: string;
  /** For asset target: base64-encoded content (e.g., compiled PDF) */
  base64?: string;
  title?: string;
  mimeType?: string;
  /** For workspace-files target: files to upsert into WorkspaceFile DB */
  files?: Array<{ path: string; content: string }>;
}

/**
 * Maps directive types to file sync configuration.
 * Each handler extracts the relevant sync info from the directive payload.
 */
const FILE_SYNC_TRIGGERS: Record<string, (payload: Record<string, unknown>) => FileSyncConfig | null> = {
  // Compiled PDF from single-file LaTeX (downloads from container URL)
  LATEX_COMPILE_COMPLETE: (p) => {
    if (!p.pdfUrl) return null;
    return {
      target: 'asset',
      service: 'latex',
      fileType: 'pdf',
      url: p.pdfUrl as string,
      title: (p.filename as string) || 'Compiled PDF',
      mimeType: 'application/pdf',
    };
  },

  // Compiled PDF from multi-file LaTeX project (base64 inline)
  LATEX_PROJECT_COMPILE_COMPLETE: (p) => {
    if (!p.pdfBase64) return null;
    return {
      target: 'asset',
      service: 'latex',
      fileType: 'pdf',
      base64: p.pdfBase64 as string,
      title: 'compiled.pdf',
      mimeType: 'application/pdf',
    };
  },

  // LaTeX project source file write/update → sync to WorkspaceFile DB
  UPDATE_LATEX_PROJECT: (p) => {
    if (!p.file || !p.content) return null;
    return {
      target: 'workspace-files',
      service: 'latex',
      fileType: 'latex-source',
      files: [{ path: `latex/${p.file as string}`, content: p.content as string }],
    };
  },

  // Jupyter notebook update → sync to WorkspaceFile DB
  UPDATE_NOTEBOOK: (p) => {
    const filename = (p.filename as string) || 'notebook.ipynb';
    const content = p.cells ? JSON.stringify(p.cells) : (p.content as string);
    if (!content) return null;
    return {
      target: 'workspace-files',
      service: 'jupyter',
      fileType: 'notebook',
      files: [{ path: `notebooks/${filename}`, content }],
    };
  },

  // Code playground file update → sync to WorkspaceFile DB
  UPDATE_CODE: (p) => {
    const files = p.files as Array<{ name: string; content: string }> | undefined;
    if (!files?.length) return null;
    return {
      target: 'workspace-files',
      service: 'code',
      fileType: 'code',
      files: files.map((f) => ({ path: `code/${f.name}`, content: f.content })),
    };
  },

  // Gallery image update → sync image metadata to WorkspaceFile DB
  UPDATE_GALLERY: (p) => {
    const images = p.images as Array<{ title?: string; url: string; caption?: string }> | undefined;
    if (!images?.length) return null;
    return {
      target: 'workspace-files',
      service: 'gallery',
      fileType: 'gallery',
      files: images.map((img, i) => {
        const safeName = (img.title || `image-${i}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        return {
          path: `gallery/${safeName}.json`,
          content: JSON.stringify({ url: img.url, caption: img.caption, title: img.title }),
        };
      }),
    };
  },
};

// ============================================================
// Route Handler
// ============================================================

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: agentId } = await params;
    const body = await request.json();

    if (!body.type) {
      return NextResponse.json(
        { success: false, error: 'type is required' },
        { status: 400 }
      );
    }

    const directive = {
      id: `dir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: body.type as string,
      payload: (body.payload || {}) as Record<string, unknown>,
      timestamp: (body.timestamp as number) || Date.now(),
    };

    log.info('Directive received from plugin', {
      agentId,
      type: directive.type,
      directiveId: directive.id,
    });

    // Enqueue for SSE delivery to frontend
    directiveQueue.enqueue(agentId, directive);

    // Async file sync for file-bearing directives (fire-and-forget)
    const syncConfig = FILE_SYNC_TRIGGERS[body.type]?.(body.payload as Record<string, unknown> || {});
    if (syncConfig) {
      if (syncConfig.target === 'workspace-files' && syncConfig.files?.length) {
        syncFilesToWorkspaceDB(agentId, syncConfig.files).catch((err) => {
          log.warn('WorkspaceFile DB sync failed', { agentId, error: String(err) });
        });
      } else if (syncConfig.target === 'asset') {
        triggerAssetSync(agentId, syncConfig).catch((err) => {
          log.warn('Asset sync failed', { agentId, error: String(err) });
        });
      }
    }

    return NextResponse.json({ success: true, data: { queued: true, id: directive.id } });
  } catch (error) {
    log.error('Directive processing error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ============================================================
// File Sync: WorkspaceFile DB Upsert
// ============================================================

/**
 * Upsert source files into the WorkspaceFile table.
 * Uses SHA256 content hash for conflict detection and skip-if-unchanged.
 */
async function syncFilesToWorkspaceDB(
  agentId: string,
  files: Array<{ path: string; content: string }>
): Promise<void> {
  const agent = await prisma.agentInstance.findUnique({
    where: { id: agentId },
    select: { workspaceId: true },
  });

  if (!agent?.workspaceId) {
    log.warn('Cannot sync files to DB — agent has no workspace', { agentId });
    return;
  }

  const workspaceId = agent.workspaceId;
  let synced = 0;

  for (const file of files) {
    const normalizedPath = file.path.replace(/^\/+/, '').replace(/\/+/g, '/');
    const contentHash = createHash('sha256').update(file.content).digest('hex');

    await prisma.workspaceFile.upsert({
      where: { workspaceId_path: { workspaceId, path: normalizedPath } },
      create: {
        workspaceId,
        path: normalizedPath,
        content: file.content,
        contentHash,
      },
      update: {
        content: file.content,
        contentHash,
      },
    });
    synced++;
  }

  log.info('Files synced to WorkspaceFile DB', { agentId, workspaceId, synced });
}

// ============================================================
// Asset Sync: Local File Storage + Asset Creation
// ============================================================

/**
 * Fire-and-forget asset sync when directive contains compiled output.
 * Handles both URL-based (download from container) and base64 (inline) content.
 */
async function triggerAssetSync(
  agentId: string,
  config: FileSyncConfig
): Promise<void> {
  const agent = await prisma.agentInstance.findUnique({
    where: { id: agentId },
    select: { workspaceId: true },
  });

  if (!agent?.workspaceId) {
    log.warn('Cannot sync asset — agent has no workspace', { agentId });
    return;
  }

  if (config.url) {
    // URL-based: delegate to existing file sync service (downloads from container)
    try {
      const { syncFileFromContainer } = await import('@/lib/services/workspace-file-sync.service');
      await syncFileFromContainer(agentId, config.service as 'latex' | 'jupyter', config.url, {
        workspaceId: agent.workspaceId,
        title: config.title || 'Compiled output',
        assetType: 'paper',
        contentType: config.mimeType || 'application/octet-stream',
      });
    } catch (err) {
      log.warn('File sync service not available', { error: String(err) });
    }
  } else if (config.base64) {
    // Base64 inline: store directly in local asset storage
    try {
      const buffer = Buffer.from(config.base64, 'base64');
      const storedFile = await storeLocalAssetBuffer({
        buffer,
        fileName: config.title || 'output.pdf',
        mimeType: config.mimeType || 'application/pdf',
        workspaceId: agent.workspaceId,
        category: config.service,
      });

      log.info('Base64 asset stored locally', { storageKey: storedFile.storageKey, size: buffer.length });

      // Create asset record
      const { assetService } = await import('@/lib/services/asset.service');
      const { getRemoteUserId } = await import('@/lib/services/workspace.service');
      const userId = getRemoteUserId();
      await assetService.create({
        userId,
        assetType: 'paper',
        title: config.title || 'Compiled PDF',
        source: 'upload',
        storageProvider: 'local',
        storageKey: storedFile.storageKey,
        fileName: storedFile.fileName,
        mimeType: storedFile.mimeType,
        metadata: {
          sourceId: `workspace:${agent.workspaceId}`,
          fileName: config.title || 'compiled.pdf',
        },
      });

      log.info('Asset created from base64 directive', { agentId, storageKey: storedFile.storageKey });
    } catch (err) {
      log.warn('Base64 asset sync failed', { error: String(err) });
    }
  }
}
