import { NextRequest, NextResponse } from 'next/server';
import { assetService } from '@/lib/services/asset.service';
import { getRemoteUserId } from '@/lib/services/workspace.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim() || undefined;
    const type = searchParams.get('type');
    const limit = Number(searchParams.get('limit') || '20');
    const offset = Number(searchParams.get('offset') || '0');
    const collectionId = searchParams.get('collectionId');

    const result = await assetService.findByUser(getRemoteUserId(), {
      search,
      type: type === 'paper' || type === 'note' ? type : undefined,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
      collectionId: collectionId ? Number(collectionId) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
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
