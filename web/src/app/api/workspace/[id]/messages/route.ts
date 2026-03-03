/**
 * Workspace Messages API
 *
 * GET    /api/workspace/[id]/messages  - Get message list (cursor pagination)
 * POST   /api/workspace/[id]/messages  - Send a new message
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspace/[id]/messages
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const before = searchParams.get('before');

    const where: Record<string, unknown> = { workspaceId };

    // Cursor-based pagination: get messages before cursor
    if (before) {
      const cursorMessage = await prisma.workspaceMessage.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (cursorMessage) {
        where.createdAt = { lt: cursorMessage.createdAt };
      }
    }

    const messages = await prisma.workspaceMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const data = messages.map(m => ({
      id: m.id,
      workspaceId: m.workspaceId,
      senderId: m.senderId,
      senderType: m.senderType,
      senderName: m.senderName,
      senderAvatar: m.senderAvatar,
      content: m.content,
      contentType: m.contentType,
      actions: m.actions ? JSON.parse(m.actions) : undefined,
      interactiveComponents: m.interactive ? JSON.parse(m.interactive) : undefined,
      uiDirectives: m.uiDirectives ? JSON.parse(m.uiDirectives) : undefined,
      agentHandoff: m.agentHandoff ? JSON.parse(m.agentHandoff) : undefined,
      references: m.references ? JSON.parse(m.references) : undefined,
      replyTo: m.replyTo,
      metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
      timestamp: m.createdAt.toISOString(),
    }));

    // Check if there are older messages
    const totalBefore = before
      ? await prisma.workspaceMessage.count({
          where: {
            workspaceId,
            createdAt: { lt: messages[0]?.createdAt || new Date() },
          },
        })
      : 0;

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        hasMore: before ? totalBefore > 0 : messages.length === limit,
        oldestId: data[0]?.id,
      },
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/messages error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspace/[id]/messages
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const body = await request.json();
    const { content, contentType = 'text', mentions, replyTo, references } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
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

    // TODO: Get sender from session
    const message = await prisma.workspaceMessage.create({
      data: {
        workspaceId,
        senderId: 'user-1',
        senderType: 'user',
        senderName: 'User',
        content: content.trim(),
        contentType,
        replyTo,
        references: references ? JSON.stringify(references) : undefined,
        metadata: mentions ? JSON.stringify({ mentions }) : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: message.id,
        workspaceId: message.workspaceId,
        senderId: message.senderId,
        senderType: message.senderType,
        senderName: message.senderName,
        content: message.content,
        contentType: message.contentType,
        replyTo: message.replyTo,
        timestamp: message.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/workspace/[id]/messages error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
