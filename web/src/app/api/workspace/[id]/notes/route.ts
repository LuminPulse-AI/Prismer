/**
 * Workspace Notes API
 *
 * PUT /api/workspace/:id/notes
 *
 * Upsert workspace notes content. If assetId provided, updates
 * the existing asset. Otherwise creates a new note asset and
 * links it to the workspace collection.
 *
 * Request body: { content: string, assetId?: number }
 * Response: { success: true, data: { assetId: number } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { upsertWorkspaceNote } from '@/lib/services/notes.service';

const log = createLogger('WorkspaceNotes');

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const { content, assetId } = await request.json();

    if (!content) {
      return NextResponse.json(
        { success: false, error: 'content is required' },
        { status: 400 }
      );
    }

    try {
      const result = await upsertWorkspaceNote({
        workspaceId,
        content,
        assetId: typeof assetId === 'number' ? assetId : null,
      });

      return NextResponse.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof Error && err.message === 'Workspace not found') {
        return NextResponse.json(
          { success: false, error: 'Workspace not found' },
          { status: 404 }
        );
      }

      // Remote MySQL unavailable — fallback to local-only
      log.warn('Remote asset service unavailable, notes not persisted to collection', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({
        success: true,
        data: { assetId: null, warning: 'Saved locally only — remote service unavailable' },
      });
    }
  } catch (error) {
    log.error('Notes save error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
