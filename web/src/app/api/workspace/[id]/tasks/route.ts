/**
 * Workspace Tasks API
 *
 * GET    /api/workspace/[id]/tasks          - Get task list
 * POST   /api/workspace/[id]/tasks          - Create a new task
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspace/[id]/tasks
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;

    const tasks = await prisma.workspaceTask.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    const data = tasks.map(t => ({
      id: t.id,
      workspaceId: t.workspaceId,
      title: t.title,
      description: t.description,
      status: t.status,
      progress: t.progress,
      subtasks: t.subtasks ? JSON.parse(t.subtasks) : [],
      outputs: t.outputs ? JSON.parse(t.outputs) : [],
      dependencies: t.dependencies ? JSON.parse(t.dependencies) : [],
      startTime: t.startTime?.toISOString(),
      endTime: t.endTime?.toISOString(),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/tasks error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspace/[id]/tasks
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const body = await request.json();
    const { title, description, subtasks } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    // Verify workspace exists
    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Build subtasks JSON
    const subtasksJson = subtasks?.length
      ? JSON.stringify(
          subtasks.map((st: { title: string }, i: number) => ({
            id: `st-${Date.now()}-${i}`,
            parentId: 'pending',
            title: st.title,
            status: 'pending',
          }))
        )
      : undefined;

    const task = await prisma.workspaceTask.create({
      data: {
        workspaceId,
        title: title.trim(),
        description: description?.trim(),
        subtasks: subtasksJson,
      },
    });

    // Update subtask parentIds
    if (subtasksJson) {
      const parsedSubtasks = JSON.parse(subtasksJson).map(
        (st: Record<string, unknown>) => ({ ...st, parentId: task.id })
      );
      await prisma.workspaceTask.update({
        where: { id: task.id },
        data: { subtasks: JSON.stringify(parsedSubtasks) },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        workspaceId: task.workspaceId,
        title: task.title,
        description: task.description,
        status: task.status,
        progress: task.progress,
        subtasks: subtasksJson ? JSON.parse(subtasksJson) : [],
        startTime: task.startTime?.toISOString(),
        endTime: task.endTime?.toISOString(),
        createdAt: task.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/workspace/[id]/tasks error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
