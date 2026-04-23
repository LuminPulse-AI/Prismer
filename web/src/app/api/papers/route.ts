import { NextResponse } from 'next/server';
import { listLocalPapers } from '@/lib/ocr/storage';

export async function GET() {
  try {
    const papers = await listLocalPapers();
    return NextResponse.json({
      success: true,
      papers,
      data: { papers },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list papers',
      },
      { status: 500 }
    );
  }
}
