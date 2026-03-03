/**
 * Workspace File API - Single file operations
 *
 * GET    /api/workspace/[id]/files/[...path] - Read file content
 * PUT    /api/workspace/[id]/files/[...path] - Update file content
 * DELETE /api/workspace/[id]/files/[...path] - Delete file
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createHash } from 'crypto';

interface Params {
  params: Promise<{ id: string; path: string[] }>;
}

/**
 * Compute SHA256 hash of content
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Build file path from path segments array
 */
function buildPath(pathSegments: string[]): string {
  return pathSegments.join('/');
}

/**
 * GET /api/workspace/[id]/files/[...path]
 *
 * Read file content
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId, path: pathSegments } = await params;
    const filePath = buildPath(pathSegments);

    const file = await prisma.workspaceFile.findUnique({
      where: {
        workspaceId_path: { workspaceId, path: filePath },
      },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: file.id,
        path: file.path,
        content: file.content,
        hash: file.contentHash,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/files/[...path] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspace/[id]/files/[...path]
 *
 * Update file content (upsert semantics)
 *
 * Request body:
 * {
 *   content: string,       // New content
 *   expectedHash?: string  // Optional: expected current hash for conflict detection
 * }
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId, path: pathSegments } = await params;
    const filePath = buildPath(pathSegments);
    const body = await request.json();
    const { content, expectedHash } = body;

    // Parameter validation
    if (content === undefined || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'content is required' },
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

    // Check for existing file
    const existing = await prisma.workspaceFile.findUnique({
      where: {
        workspaceId_path: { workspaceId, path: filePath },
      },
    });

    // Conflict detection
    if (expectedHash && existing && existing.contentHash !== expectedHash) {
      return NextResponse.json(
        {
          success: false,
          error: 'Content has been modified',
          code: 'CONFLICT',
          currentHash: existing.contentHash,
        },
        { status: 409 }
      );
    }

    const contentHash = hashContent(content);

    // Upsert operation
    const file = await prisma.workspaceFile.upsert({
      where: {
        workspaceId_path: { workspaceId, path: filePath },
      },
      update: {
        content,
        contentHash,
      },
      create: {
        workspaceId,
        path: filePath,
        content,
        contentHash,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: file.id,
        path: file.path,
        hash: file.contentHash,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
        created: !existing,
      },
    });
  } catch (error) {
    console.error('PUT /api/workspace/[id]/files/[...path] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspace/[id]/files/[...path]
 *
 * Delete a file
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId, path: pathSegments } = await params;
    const filePath = buildPath(pathSegments);

    const file = await prisma.workspaceFile.findUnique({
      where: {
        workspaceId_path: { workspaceId, path: filePath },
      },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    await prisma.workspaceFile.delete({
      where: { id: file.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: file.id,
        path: file.path,
        deleted: true,
      },
    });
  } catch (error) {
    console.error('DELETE /api/workspace/[id]/files/[...path] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
