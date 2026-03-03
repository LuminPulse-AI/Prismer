/**
 * Workspace Files Sync API - Batch sync
 *
 * POST /api/workspace/[id]/files/sync - Diff-based file sync
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createHash } from 'crypto';

interface Params {
  params: Promise<{ id: string }>;
}

interface FileManifestEntry {
  path: string;
  hash: string;
}

interface SyncRequest {
  files: FileManifestEntry[];
}

/**
 * Compute SHA256 hash of content
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * POST /api/workspace/[id]/files/sync
 *
 * Hash-based diff sync
 *
 * Request body:
 * {
 *   files: [{ path: string, hash: string }]
 * }
 *
 * Response:
 * {
 *   toUpload: string[],    // File paths the client needs to upload (server missing or hash differs)
 *   toDownload: string[],  // File paths the client needs to download (server has but client doesn't)
 *   conflicts: [{          // Conflicting files (both sides modified)
 *     path: string,
 *     clientHash: string,
 *     serverHash: string
 *   }],
 *   unchanged: string[]    // Files requiring no action
 * }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const body: SyncRequest = await request.json();
    const { files: clientFiles } = body;

    // Parameter validation
    if (!Array.isArray(clientFiles)) {
      return NextResponse.json(
        { success: false, error: 'files must be an array' },
        { status: 400 }
      );
    }

    // Verify workspace exists
    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Get server-side file list
    const serverFiles = await prisma.workspaceFile.findMany({
      where: { workspaceId },
      select: {
        path: true,
        contentHash: true,
      },
    });

    // Build maps for efficient lookup
    const clientMap = new Map<string, string>();
    for (const f of clientFiles) {
      if (f.path && f.hash) {
        clientMap.set(f.path, f.hash);
      }
    }

    const serverMap = new Map<string, string>();
    for (const f of serverFiles) {
      serverMap.set(f.path, f.contentHash);
    }

    // Compute diff
    const toUpload: string[] = [];
    const toDownload: string[] = [];
    const conflicts: { path: string; clientHash: string; serverHash: string }[] = [];
    const unchanged: string[] = [];

    // Check client files
    clientMap.forEach((clientHash, path) => {
      const serverHash = serverMap.get(path);

      if (!serverHash) {
        // Server doesn't have it, client needs to upload
        toUpload.push(path);
      } else if (clientHash === serverHash) {
        // Same, no action needed
        unchanged.push(path);
      } else {
        // Different, mark as conflict (simple strategy: server wins, client needs to download)
        // Advanced strategy could use timestamps or version numbers
        conflicts.push({ path, clientHash, serverHash });
      }
    });

    // Check files that exist on server but not on client
    serverMap.forEach((_, path) => {
      if (!clientMap.has(path)) {
        toDownload.push(path);
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        toUpload,
        toDownload,
        conflicts,
        unchanged,
        summary: {
          upload: toUpload.length,
          download: toDownload.length,
          conflict: conflicts.length,
          unchanged: unchanged.length,
        },
      },
    });
  } catch (error) {
    console.error('POST /api/workspace/[id]/files/sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspace/[id]/files/sync
 *
 * Batch update files (for client upload)
 *
 * Request body:
 * {
 *   files: [{
 *     path: string,
 *     content: string
 *   }]
 * }
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const body = await request.json();
    const { files } = body;

    // Parameter validation
    if (!Array.isArray(files)) {
      return NextResponse.json(
        { success: false, error: 'files must be an array' },
        { status: 400 }
      );
    }

    // Verify workspace exists
    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Batch upsert
    const results: { path: string; hash: string; created: boolean }[] = [];

    for (const file of files) {
      if (!file.path || typeof file.content !== 'string') {
        continue;
      }

      const normalizedPath = file.path.replace(/^\/+/, '').replace(/\/+/g, '/');
      const contentHash = hashContent(file.content);

      const existing = await prisma.workspaceFile.findUnique({
        where: {
          workspaceId_path: { workspaceId, path: normalizedPath },
        },
      });

      await prisma.workspaceFile.upsert({
        where: {
          workspaceId_path: { workspaceId, path: normalizedPath },
        },
        update: {
          content: file.content,
          contentHash,
        },
        create: {
          workspaceId,
          path: normalizedPath,
          content: file.content,
          contentHash,
        },
      });

      results.push({
        path: normalizedPath,
        hash: contentHash,
        created: !existing,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        updated: results.length,
        files: results,
      },
    });
  } catch (error) {
    console.error('PUT /api/workspace/[id]/files/sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
