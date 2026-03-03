/**
 * Workspace Participants API
 *
 * GET    /api/workspace/[id]/participants           - List participants
 * POST   /api/workspace/[id]/participants           - Add a participant
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;

    const participants = await prisma.workspaceParticipant.findMany({
      where: { workspaceId },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: participants.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        type: p.type,
        status: p.status,
        role: p.role,
        capabilities: p.capabilities ? JSON.parse(p.capabilities) : undefined,
        joinedAt: p.joinedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/participants error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const body = await request.json();
    const { userId, agentId, name, role = 'member', type = 'user', capabilities } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    const participant = await prisma.workspaceParticipant.create({
      data: {
        workspaceId,
        userId: userId || undefined,
        agentId: agentId || undefined,
        name,
        type,
        role,
        status: 'offline',
        capabilities: capabilities ? JSON.stringify(capabilities) : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: participant.id,
        name: participant.name,
        type: participant.type,
        status: participant.status,
        role: participant.role,
        capabilities: participant.capabilities ? JSON.parse(participant.capabilities) : undefined,
        joinedAt: participant.joinedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/workspace/[id]/participants error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
