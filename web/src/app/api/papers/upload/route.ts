import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  findOCRPaperDirectory,
  getLocalPaperMeta,
  writeOCRBinaryFile,
  writeOCRTextFile,
} from '@/lib/ocr/storage';
import {
  buildOCRDatasetFromVolcengineResult,
  localizeVolcengineImages,
  runVolcenginePdfParse,
} from '@/lib/ocr/volcengine';

export const runtime = 'nodejs';

function sanitizePaperId(value: string): string {
  const extension = path.extname(value);
  return value
    .trim()
    .toLowerCase()
    .replace(new RegExp(`${extension.replace('.', '\\.')}$`, 'i'), '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `paper-${randomUUID().slice(0, 8)}`;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  );
}

function resolvePublicAppUrl(request: NextRequest): string | null {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const origin = request.nextUrl.origin;

  try {
    const parsed = new URL(origin);
    if (isLocalHostname(parsed.hostname)) {
      return null;
    }
    return origin.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

async function fetchRemotePdf(sourceUrl: string): Promise<Buffer> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download source PDF: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('pdf') && !sourceUrl.toLowerCase().endsWith('.pdf')) {
    throw new Error('Source URL does not look like a PDF');
  }

  return Buffer.from(await response.arrayBuffer());
}

async function resolveUniquePaperId(baseId: string): Promise<string> {
  const candidate = sanitizePaperId(baseId);
  if (!(await findOCRPaperDirectory(candidate))) {
    return candidate;
  }

  for (let index = 2; index < 1000; index += 1) {
    const nextId = `${candidate}-${index}`;
    if (!(await findOCRPaperDirectory(nextId))) {
      return nextId;
    }
  }

  return `${candidate}-${Date.now()}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const fileEntry = formData.get('file');
    const sourceUrlValue = formData.get('sourceUrl');
    const workspaceId = String(formData.get('workspaceId') || '').trim();
    const requestedPaperId = String(formData.get('paperId') || '').trim();
    const requestedTitle = String(formData.get('title') || '').trim();
    const processOcrValue = String(formData.get('processOcr') || 'true').trim().toLowerCase();

    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
    const sourceUrl = typeof sourceUrlValue === 'string' ? sourceUrlValue.trim() : '';
    const processOcr = processOcrValue !== 'false' && processOcrValue !== '0';

    if (!file && !sourceUrl) {
      return NextResponse.json(
        { success: false, error: 'Provide a PDF file or a public sourceUrl' },
        { status: 400 }
      );
    }

    if (file && !file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: 'Only PDF uploads are supported' },
        { status: 400 }
      );
    }

    let parsedSourceUrl: URL | null = null;
    if (sourceUrl) {
      try {
        parsedSourceUrl = new URL(sourceUrl);
      } catch {
        return NextResponse.json(
          { success: false, error: 'sourceUrl must be a valid URL' },
          { status: 400 }
        );
      }
    }

    const baseId = requestedPaperId || requestedTitle || file?.name || parsedSourceUrl?.pathname || 'paper';
    const paperId = await resolveUniquePaperId(baseId);
    const localPdfFileName = `${paperId}.pdf`;

    let pdfBuffer: Buffer | null = null;
    if (file) {
      pdfBuffer = Buffer.from(await file.arrayBuffer());
    } else if (sourceUrl) {
      pdfBuffer = await fetchRemotePdf(sourceUrl);
    }

    if (!pdfBuffer) {
      throw new Error('Failed to resolve PDF payload');
    }

    await writeOCRBinaryFile(paperId, localPdfFileName, pdfBuffer);

    let ocrStatus: 'completed' | 'skipped' | 'failed' = 'skipped';
    let ocrMessage: string | null = null;

    if (processOcr && process.env.VOLCENGINE_LAS_API_KEY) {
      const publicPdfBaseUrl = resolvePublicAppUrl(request);
      const ocrSourceUrl = sourceUrl || (publicPdfBaseUrl ? `${publicPdfBaseUrl}/api/ocr/${paperId}/pdf` : '');

      if (!ocrSourceUrl) {
        ocrMessage =
          'PDF saved locally. OCR was skipped because Volcengine needs a public source URL or PUBLIC_APP_URL.';
        } else {
        try {
          const providerResult = await runVolcenginePdfParse({ sourceUrl: ocrSourceUrl });
          const localizedResult = await localizeVolcengineImages({
            paperId,
            result: providerResult,
          });
          const dataset = buildOCRDatasetFromVolcengineResult({
            paperId,
            title: requestedTitle || undefined,
            result: localizedResult,
          });

          await Promise.all([
            writeOCRTextFile(paperId, 'metadata.json', JSON.stringify(dataset.metadata, null, 2)),
            writeOCRTextFile(paperId, 'ocr_result.json', JSON.stringify(dataset.ocrResult, null, 2)),
            writeOCRTextFile(paperId, 'detections.json', JSON.stringify(dataset.detections, null, 2)),
            writeOCRTextFile(paperId, 'paper.md', dataset.markdown),
          ]);

          ocrStatus = 'completed';
          ocrMessage = null;
        } catch (error) {
          ocrStatus = 'failed';
          ocrMessage = error instanceof Error ? error.message : 'Volcengine OCR failed';
        }
      }
    } else if (processOcr) {
      ocrMessage = 'PDF saved locally. OCR was skipped because VOLCENGINE_LAS_API_KEY is not configured.';
    }

    const paper = await getLocalPaperMeta(paperId);
    let assetId: number | null = null;

    try {
      const { assetService } = await import('@/lib/services/asset.service');
      const { getRemoteUserId, workspaceService } = await import('@/lib/services/workspace.service');
      const { collectionService } = await import('@/lib/services/collection.service');

      const userId = getRemoteUserId();
      const assetPayload = {
        title: paper.title,
        description: paper.abstract ?? null,
        source: sourceUrl ? 'url-import' : 'upload',
        storageProvider: 'external' as const,
        externalUrl: `/api/ocr/${paperId}/pdf`,
        fileName: `${paperId}.pdf`,
        mimeType: 'application/pdf',
        metadata: {
          sourceId: paperId,
          arxivId: paper.arxivId ?? paperId,
          hasOCRData: paper.hasOCRData,
          importProvider: ocrStatus === 'completed' ? 'volcengine' : 'local',
          ocrStatus,
        },
      };

      const existingAsset = await assetService.findBySourceId(userId, paperId, 'paper');
      const asset = existingAsset
        ? await assetService.update(existingAsset.id, userId, assetPayload)
        : await assetService.create({
            userId,
            assetType: 'paper',
            ...assetPayload,
          });

      assetId = asset?.id ?? null;

      if (workspaceId && assetId) {
        const collectionId = await workspaceService.ensureCollectionBinding(workspaceId);
        if (collectionId) {
          await collectionService.addAsset(collectionId, assetId, userId);
        }
      }
    } catch (error) {
      console.warn('Failed to register imported paper as asset:', error);
    }

    return NextResponse.json({
      success: true,
      data: {
        paper,
        paperId,
        assetId,
        ocrStatus,
        message: ocrMessage,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import paper',
      },
      { status: 500 }
    );
  }
}
