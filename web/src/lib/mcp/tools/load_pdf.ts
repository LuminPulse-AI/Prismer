import { createHash } from 'crypto';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { storeLocalAssetBuffer } from '@/lib/assets/storage';
import { getRemoteUserId } from '@/lib/services/workspace.service';
import { assetService } from '@/lib/services/asset.service';
import { McpToolError, toolSuccess } from '../errors';
import { fetchUrlBufferWithSsrfProtection } from '../ssrf';
import { postWorkspaceDirective, type WorkspaceMcpToolContext } from './context';

const DEFAULT_MAX_PDF_SIZE_MB = 100;
const DEFAULT_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_REDIRECT_LIMIT = 3;

export const loadPdfInputSchema = {
  assetId: z.number().int().positive().optional(),
  url: z.string().optional(),
  page: z.number().int().positive().optional(),
};

export async function loadPdfTool(
  context: WorkspaceMcpToolContext,
  input: { assetId?: number; url?: string; page?: number }
) {
  if (!input.assetId && !input.url) {
    throw new McpToolError('MISSING_SOURCE', 'assetId or url is required');
  }

  if (input.assetId && input.url) {
    throw new McpToolError('BOTH_SOURCES', 'Provide either assetId or url, not both');
  }

  const page = input.page ?? 1;
  const resolved = input.assetId
    ? await resolveAssetPdf(context, input.assetId)
    : await resolveUrlPdf(context, input.url as string);
  const totalPages = await getPdfPageCount(resolved.buffer);

  if (totalPages > 0 && page > totalPages) {
    throw new McpToolError('INVALID_PAGE', `page must be between 1 and ${totalPages}`);
  }

  const source = `/api/v2/assets/${resolved.assetId}/file`;
  await postWorkspaceDirective(context, 'SWITCH_COMPONENT', { component: 'pdf-reader' });
  await postWorkspaceDirective(context, 'PDF_LOAD_DOCUMENT', { source, page });

  return toolSuccess({
    ok: true,
    assetId: resolved.assetId,
    source,
    totalPages,
    currentPage: page,
  });
}

async function resolveAssetPdf(
  context: WorkspaceMcpToolContext,
  assetId: number
): Promise<{ assetId: number; buffer: Buffer }> {
  const userId = getRemoteUserId();
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, userId: true },
  });

  if (!asset) {
    throw new McpToolError('ASSET_NOT_FOUND', 'Asset not found');
  }

  if (asset.userId !== userId) {
    throw new McpToolError('ASSET_FORBIDDEN', 'Asset is not owned by the current self-host user');
  }

  const buffer = await fetchAssetBuffer(context.baseUrl, assetId);
  assertPdfMagic(buffer);
  return { assetId, buffer };
}

async function resolveUrlPdf(
  context: WorkspaceMcpToolContext,
  url: string
): Promise<{ assetId: number; buffer: Buffer }> {
  const sourceUrlHash = createHash('sha256').update(url).digest('hex');
  const userId = getRemoteUserId();
  const existing = await prisma.asset.findFirst({
    where: {
      userId,
      assetType: 'paper',
      metadata: {
        contains: `"sourceUrlHash":"${sourceUrlHash}"`,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    const buffer = await fetchAssetBuffer(context.baseUrl, existing.id);
    assertPdfMagic(buffer);
    return { assetId: existing.id, buffer };
  }

  const fetched = await fetchUrlBufferWithSsrfProtection(url, {
    maxBytes: getMaxPdfBytes(),
    timeoutMs: getIntegerEnv('MCP_FETCH_TIMEOUT_MS', DEFAULT_FETCH_TIMEOUT_MS),
    redirectLimit: getIntegerEnv('MCP_REDIRECT_LIMIT', DEFAULT_REDIRECT_LIMIT),
  });

  if (!isPdfContentType(fetched.contentType)) {
    throw new McpToolError('URL_NOT_PDF', 'URL did not return application/pdf content');
  }

  assertPdfMagic(fetched.buffer);

  const fileName = inferPdfFileName(fetched.finalUrl);
  const storedFile = await storeLocalAssetBuffer({
    buffer: fetched.buffer,
    fileName,
    mimeType: 'application/pdf',
    workspaceId: context.workspaceId,
    category: 'mcp-pdf',
  });
  const asset = await assetService.create({
    userId,
    assetType: 'paper',
    title: fileName.replace(/\.pdf$/i, '') || 'PDF document',
    source: 'url',
    storageProvider: 'local',
    storageKey: storedFile.storageKey,
    fileName: storedFile.fileName,
    mimeType: storedFile.mimeType,
    metadata: {
      sourceId: `mcp-url:${sourceUrlHash}`,
      sourceUrl: fetched.finalUrl,
      sourceUrlHash,
    },
  });

  return { assetId: asset.id, buffer: fetched.buffer };
}

async function fetchAssetBuffer(baseUrl: string, assetId: number): Promise<Buffer> {
  const response = await fetch(new URL(`/api/v2/assets/${assetId}/file`, baseUrl));
  if (!response.ok) {
    throw new McpToolError('ASSET_NOT_FOUND', `Asset file could not be read: HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function getPdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const info = await parser.getInfo();
      return typeof info.total === 'number' ? info.total : 0;
    } finally {
      await parser.destroy();
    }
  } catch {
    return 0;
  }
}

function assertPdfMagic(buffer: Buffer): void {
  if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new McpToolError('URL_NOT_PDF', 'PDF magic bytes are missing');
  }
}

function isPdfContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const normalized = contentType.split(';')[0]?.trim().toLowerCase();
  return normalized === 'application/pdf' || normalized === 'application/octet-stream';
}

function inferPdfFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').filter(Boolean).pop();
    if (last && /\.pdf$/i.test(last)) {
      return decodeURIComponent(last);
    }
  } catch {
    // fall through
  }

  return 'document.pdf';
}

function getMaxPdfBytes(): number {
  return getIntegerEnv('MCP_MAX_PDF_SIZE_MB', DEFAULT_MAX_PDF_SIZE_MB) * 1024 * 1024;
}

function getIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
