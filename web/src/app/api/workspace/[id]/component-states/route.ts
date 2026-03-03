/**
 * Workspace Component States API
 *
 * GET    /api/workspace/[id]/component-states        - Get all component states
 * PATCH  /api/workspace/[id]/component-states        - Update a specific component state (body: { componentType, state })
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;

    const states = await prisma.workspaceComponentState.findMany({
      where: { workspaceId },
    });

    const statesMap: Record<string, unknown> = {};
    for (const s of states) {
      statesMap[s.componentType] = JSON.parse(s.state);
    }

    return NextResponse.json({
      success: true,
      data: {
        states: statesMap,
      },
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/component-states error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const body = await request.json();
    const { componentType, state } = body;

    if (!componentType || !state) {
      return NextResponse.json(
        { success: false, error: 'componentType and state are required' },
        { status: 400 }
      );
    }

    await prisma.workspaceComponentState.upsert({
      where: {
        workspaceId_componentType: { workspaceId, componentType },
      },
      update: {
        state: JSON.stringify(state),
      },
      create: {
        workspaceId,
        componentType,
        state: JSON.stringify(state),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/workspace/[id]/component-states error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
