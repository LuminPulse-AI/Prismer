import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { readLocalAssetBuffer } from '@/lib/assets/storage';
import { BUCKET, s3Client } from '@/lib/s3';
import { assetService } from '@/lib/services/asset.service';
import { getRemoteUserId } from '@/lib/services/workspace.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function toSafeAsciiFilename(fileName: string | null): string {
  return (fileName || 'asset')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
}

function buildHeaders(fileName: string | null, mimeType: string | null): HeadersInit {
  const safeAsciiName = toSafeAsciiFilename(fileName);
  const encodedFileName = encodeURIComponent(fileName || 'asset');

  return {
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedFileName}`,
    'Cache-Control': 'private, max-age=0, must-revalidate',
  };
}

function resolveRedirectTarget(externalUrl: string, requestUrl: string): URL | string {
  if (/^https?:\/\//i.test(externalUrl)) {
    return externalUrl;
  }

  return new URL(externalUrl, requestUrl);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const assetId = Number(id);

    if (!Number.isInteger(assetId) || assetId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid asset id' }, { status: 400 });
    }

    const asset = await assetService.findById(assetId, getRemoteUserId());
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    if (asset.storageProvider === 'external' && asset.externalUrl) {
      return NextResponse.redirect(resolveRedirectTarget(asset.externalUrl, request.url));
    }

    if (asset.storageProvider === 'local' && asset.storageKey) {
      const buffer = await readLocalAssetBuffer(asset.storageKey);
      return new NextResponse(new Uint8Array(buffer), {
        headers: buildHeaders(asset.fileName, asset.mimeType),
      });
    }

    if (asset.storageProvider === 's3' && asset.storageKey) {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET,
          Key: asset.storageKey,
        })
      );

      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) {
        return NextResponse.json({ success: false, error: 'Asset content missing' }, { status: 404 });
      }

      return new NextResponse(new Uint8Array(bytes), {
        headers: buildHeaders(asset.fileName, asset.mimeType),
      });
    }

    if (asset.content) {
      return new NextResponse(asset.content, {
        headers: buildHeaders(asset.fileName || `${asset.title}.md`, asset.mimeType || 'text/markdown; charset=utf-8'),
      });
    }

    return NextResponse.json(
      { success: false, error: 'Asset has no readable file content' },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
