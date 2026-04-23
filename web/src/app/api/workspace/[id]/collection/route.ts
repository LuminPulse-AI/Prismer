/**
 * Workspace Collection API
 *
 * GET /api/workspace/:id/collection
 *
 * Retrieves the collection bound to this workspace.
 * The collectionId is stored in workspace settings JSON.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const workspace = await prisma.workspaceSession.findUnique({
      where: { id },
      select: { settings: true, name: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    const settings = workspace.settings ? JSON.parse(workspace.settings as string) : {};
    const collectionId = settings.collectionId;

    if (!collectionId) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No collection bound to this workspace',
      });
    }

    const { collectionService } = await import('@/lib/services/collection.service');
    const { getRemoteUserId } = await import('@/lib/services/workspace.service');
    const collection = await collectionService.getById(collectionId, getRemoteUserId());

    return NextResponse.json({
      success: true,
      data: collection ?? { id: collectionId, name: workspace.name, status: 'missing' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
