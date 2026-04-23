import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  findOCRFile,
  findOCRPdfFile,
} from '@/lib/ocr/storage';
import { normalizeDetectionsPayload } from '@/lib/ocr/normalize';

interface RouteParams {
  params: Promise<{ paperId: string; path: string[] }>;
}

function contentTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.json':
      return 'application/json; charset=utf-8';
    case '.md':
      return 'text/markdown; charset=utf-8';
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function buildFileResponse(filePath: string, options?: { head?: boolean; normalizeDetections?: boolean }) {
  const stat = await fs.stat(filePath);
  const headers = new Headers({
    'Content-Type': contentTypeForFile(filePath),
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'Content-Length': String(stat.size),
  });

  if (options?.head) {
    return new NextResponse(null, { headers });
  }

  if (options?.normalizeDetections) {
    const raw = await fs.readFile(filePath, 'utf8');
    const normalized = normalizeDetectionsPayload(JSON.parse(raw));
    return NextResponse.json(normalized, { headers });
  }

  const buffer = await fs.readFile(filePath);
  return new NextResponse(new Uint8Array(buffer), { headers });
}

async function handleRequest(
  _request: NextRequest,
  { params }: RouteParams,
  method: 'GET' | 'HEAD'
) {
  try {
    const { paperId, path: pathSegments } = await params;
    const requestPath = pathSegments.join('/');

    const filePath =
      requestPath === 'pdf'
        ? await findOCRPdfFile(paperId)
        : await findOCRFile(paperId, requestPath);

    if (!filePath) {
      return NextResponse.json({ success: false, error: 'OCR file not found' }, { status: 404 });
    }

    return buildFileResponse(filePath, {
      head: method === 'HEAD',
      normalizeDetections: requestPath === 'detections.json' && method === 'GET',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load OCR file',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteParams) {
  return handleRequest(request, context, 'GET');
}

export async function HEAD(request: NextRequest, context: RouteParams) {
  return handleRequest(request, context, 'HEAD');
}
