/**
 * Workspace Timeline API
 *
 * GET    /api/workspace/[id]/timeline  - Get timeline events
 * POST   /api/workspace/[id]/timeline  - Add an event
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: Record<string, unknown> = { workspaceId };
    if (from || to) {
      const timestampFilter: Record<string, bigint> = {};
      if (from) timestampFilter.gte = BigInt(from);
      if (to) timestampFilter.lte = BigInt(to);
      where.timestamp = timestampFilter;
    }

    const events = await prisma.workspaceTimelineEvent.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: events.map(e => ({
        id: e.id,
        timestamp: Number(e.timestamp),
        componentType: e.componentType,
        action: e.action,
        description: e.description,
        stateSnapshot: e.snapshot ? JSON.parse(e.snapshot) : undefined,
        actorId: e.actorId,
        actorType: e.actorType,
        messageId: e.messageId,
        duration: e.duration,
      })),
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/timeline error:', error);
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
    const { timestamp, componentType, action, description, stateSnapshot, actorId, actorType, messageId, duration } = body;

    if (!componentType || !action || !description) {
      return NextResponse.json(
        { success: false, error: 'componentType, action, and description are required' },
        { status: 400 }
      );
    }

    const event = await prisma.workspaceTimelineEvent.create({
      data: {
        workspaceId,
        timestamp: BigInt(timestamp || Date.now()),
        componentType,
        action,
        description,
        snapshot: stateSnapshot ? JSON.stringify(stateSnapshot) : undefined,
        actorId,
        actorType,
        messageId,
        duration,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: event.id,
        timestamp: Number(event.timestamp),
        componentType: event.componentType,
        action: event.action,
        description: event.description,
        actorId: event.actorId,
        actorType: event.actorType,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/workspace/[id]/timeline error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
