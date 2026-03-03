/**
 * Workspace API - Single workspace operations
 *
 * GET    /api/workspace/[id]     - Get workspace details
 * PATCH  /api/workspace/[id]     - Update workspace
 * DELETE /api/workspace/[id]     - Delete workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { workspaceService } from '@/lib/services/workspace.service';

interface Params {
  params: Promise<{ id: string }>;
}

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
 * GET /api/workspace/[id]
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const workspace = await prisma.workspaceSession.findUnique({
      where: { id },
      include: {
        participants: true,
        tasks: {
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { participants: true, tasks: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    const settings = workspace.settings
      ? JSON.parse(workspace.settings)
      : { autoSave: true, notificationsEnabled: true };

    return NextResponse.json({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
        status: workspace.status,
        participants: workspace.participants.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          type: p.type,
          status: p.status,
          role: p.role,
          capabilities: p.capabilities ? JSON.parse(p.capabilities) : undefined,
        })),
        tasks: workspace.tasks.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          progress: t.progress,
          subtasks: t.subtasks ? JSON.parse(t.subtasks) : [],
          startTime: t.startTime?.toISOString(),
          endTime: t.endTime?.toISOString(),
        })),
        taskSummary: {
          total: workspace._count.tasks,
          completed: workspace.tasks.filter(t => t.status === 'completed').length,
          running: workspace.tasks.filter(t => t.status === 'running').length,
          pending: workspace.tasks.filter(t => t.status === 'pending').length,
        },
        settings,
      },
    });
  } catch (error) {
    console.error('GET /api/workspace/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspace/[id]
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, status, settings } = body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json(
        { success: false, error: 'Invalid name' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (status !== undefined) data.status = status;
    if (settings !== undefined) {
      const existing = await prisma.workspaceSession.findUnique({
        where: { id },
        select: { settings: true },
      });
      const current = existing?.settings ? JSON.parse(existing.settings) : {};
      data.settings = JSON.stringify({ ...current, ...settings });
    }

    const workspace = await prisma.workspaceSession.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        status: workspace.status,
        updatedAt: workspace.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/workspace/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspace/[id]
 * Requires ownership validation
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const ownerId = await getCurrentUserId();

    // Use service for proper cascading delete
    const deleted = await workspaceService.delete(id, ownerId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found or not authorized' },
        { status: 404 }
      );
    }

    // Get next workspace to redirect to
    const nextWorkspace = await workspaceService.getNextWorkspace(id, ownerId);

    return NextResponse.json({
      success: true,
      data: {
        id,
        deleted: true,
        nextWorkspaceId: nextWorkspace?.id ?? null,
      },
    });
  } catch (error) {
    console.error('DELETE /api/workspace/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
