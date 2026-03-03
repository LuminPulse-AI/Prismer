/**
 * Workspace API - Workspace CRUD
 *
 * GET    /api/workspace          - Get workspace list
 * POST   /api/workspace          - Create a new workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { workspaceService } from '@/lib/services/workspace.service';

/**
 * Open-source workspace mode runs in single-user local mode.
 */
async function getCurrentUserId(): Promise<string> {
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

/**
 * GET /api/workspace
 * Get the current user's workspace list
 */
export async function GET(request: NextRequest) {
  try {
    const ownerId = await getCurrentUserId();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'active' | 'archived' | null;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const collectionId = searchParams.get('collectionId');

    // Find workspace by collectionId (reverse navigation: asset collection → workspace)
    if (collectionId) {
      const workspaces = await prisma.workspaceSession.findMany({
        where: { ownerId },
        select: { id: true, name: true, settings: true },
      });
      const match = workspaces.find((ws) => {
        if (!ws.settings) return false;
        try {
          const s = JSON.parse(ws.settings as string);
          return String(s.collectionId) === collectionId;
        } catch { return false; }
      });
      return NextResponse.json({
        success: true,
        data: match ? { id: match.id, name: match.name } : null,
      });
    }

    const result = await workspaceService.list({
      ownerId,
      status: status ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.workspaces,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error('GET /api/workspace error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspace
 * Create a new workspace
 */
export async function POST(request: NextRequest) {
  try {
    const ownerId = await getCurrentUserId();

    const body = await request.json();
    const { name, description, templateType, settings } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    // Validate templateType if provided
    const validTemplates = ['mathematician', 'finance-researcher', 'cs-researcher', 'academic-researcher', 'data-scientist', 'paper-reviewer'];
    const template = validTemplates.includes(templateType) ? templateType : undefined;

    const workspace = await workspaceService.create({
      name,
      description,
      ownerId,
      templateType: template,
      settings,
    });

    return NextResponse.json({
      success: true,
      data: workspace,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/workspace error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
