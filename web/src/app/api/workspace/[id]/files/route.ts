/**
 * Workspace Files API - File listing and creation
 *
 * GET  /api/workspace/[id]/files - List all workspace files
 * POST /api/workspace/[id]/files - Create a new file
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createHash } from 'crypto';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Compute SHA256 hash of content
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * GET /api/workspace/[id]/files
 *
 * List all files in the workspace
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;

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

    // Get all files
    const files = await prisma.workspaceFile.findMany({
      where: { workspaceId },
      select: {
        id: true,
        path: true,
        contentHash: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { path: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        workspaceId,
        files: files.map((f) => ({
          id: f.id,
          path: f.path,
          hash: f.contentHash,
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
        })),
        count: files.length,
      },
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/files error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspace/[id]/files
 *
 * Create a new file
 *
 * Request body:
 * {
 *   path: string,    // File path (e.g. "IDENTITY.md", "skills/latex/SKILL.md")
 *   content: string  // File content
 * }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const body = await request.json();
    const { path, content } = body;

    // Parameter validation
    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { success: false, error: 'path is required' },
        { status: 400 }
      );
    }

    if (content === undefined || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'content is required' },
        { status: 400 }
      );
    }

    // Normalize path
    const normalizedPath = path.replace(/^\/+/, '').replace(/\/+/g, '/');

    // Validate path format
    if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
      return NextResponse.json(
        { success: false, error: 'Invalid path format' },
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

    // Check if file already exists
    const existing = await prisma.workspaceFile.findUnique({
      where: {
        workspaceId_path: { workspaceId, path: normalizedPath },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'File already exists', code: 'FILE_EXISTS' },
        { status: 409 }
      );
    }

    // Create file
    const contentHash = hashContent(content);
    const file = await prisma.workspaceFile.create({
      data: {
        workspaceId,
        path: normalizedPath,
        content,
        contentHash,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: file.id,
          path: file.path,
          hash: file.contentHash,
          createdAt: file.createdAt.toISOString(),
          updatedAt: file.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/workspace/[id]/files error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
