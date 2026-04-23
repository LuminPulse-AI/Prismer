import path from 'node:path';
import type { Page } from '@playwright/test';

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X2VINQAAAABJRU5ErkJggg==',
  'base64'
);

export const PDF_FIXTURE_PATH = path.resolve(process.cwd(), 'public/mockdata/2303.11366v4.pdf');

interface MockPaper {
  id: string;
  arxivId: string;
  title: string;
  authors: string[];
  published: string;
  abstract: string;
  hasOCRData: boolean;
  pdfPath: string;
}

interface MockAsset {
  id: number;
  asset_type: 'paper';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  file_url: string;
  created_at: string;
}

function buildPaper(id: string, title: string): MockPaper {
  return {
    id,
    arxivId: id,
    title,
    authors: ['Playwright Bot'],
    published: '2026-04-23',
    abstract: `${title} abstract`,
    hasOCRData: true,
    pdfPath: `/api/ocr/${id}/pdf`,
  };
}

function buildAsset(paper: MockPaper, assetId: number): MockAsset {
  return {
    id: assetId,
    asset_type: 'paper',
    title: paper.title,
    description: paper.abstract,
    metadata: {
      sourceId: paper.id,
      arxivId: paper.arxivId,
      hasOCRData: paper.hasOCRData,
      ocrStatus: 'completed',
    },
    file_url: paper.pdfPath,
    created_at: new Date('2026-04-23T00:00:00.000Z').toISOString(),
  };
}

function buildMetadata(id: string, title: string) {
  return {
    arxiv_id: id,
    title,
    authors: ['Playwright Bot'],
    abstract: `${title} abstract`,
    published: '2026-04-23',
    categories: ['cs.AI'],
    total_pages: 1,
    page_metas: [
      {
        page: 1,
        width: 1200,
        height: 1600,
        dpi: 144,
      },
    ],
  };
}

function buildOcrResult(title: string) {
  return {
    success: true,
    total_pages: 1,
    total_processing_time: 0.5,
    markdown_content: `# ${title}\n\nImported from the self-host browser flow.`,
    pages: [
      {
        page_number: 1,
        content: `# ${title}\n\nImported from the self-host browser flow.`,
        meta: {
          width: 1200,
          height: 1600,
          dpi: 144,
        },
        detection_count: 3,
        image_count: 1,
      },
    ],
  };
}

function buildDetections() {
  return {
    pages: [
      {
        page_number: 1,
        image_count: 1,
        detections: [
          {
            id: 'p1_title_0',
            label: 'title',
            text: 'Imported Paper',
            raw_text: 'Imported Paper',
            boxes: [
              {
                x1: 10,
                y1: 20,
                x2: 110,
                y2: 60,
                x1_px: 10,
                y1_px: 20,
                x2_px: 110,
                y2_px: 60,
              },
            ],
          },
          {
            id: 'p1_text_1',
            label: 'text',
            text: 'Imported from the self-host browser flow.',
            raw_text: 'Imported from the self-host browser flow.',
            boxes: [
              {
                x1: 10,
                y1: 80,
                x2: 220,
                y2: 140,
                x1_px: 10,
                y1_px: 80,
                x2_px: 220,
                y2_px: 140,
              },
            ],
          },
          {
            id: 'p1_image_2',
            label: 'image',
            text: '',
            raw_text: '',
            metadata: {
              image_path: 'images/page1_img0.png',
            },
            boxes: [
              {
                x1: 30,
                y1: 180,
                x2: 260,
                y2: 420,
                x1_px: 30,
                y1_px: 180,
                x2_px: 260,
                y2_px: 420,
              },
            ],
          },
        ],
      },
    ],
  };
}

function jsonBody(data: unknown): string {
  return JSON.stringify(data);
}

export async function mockSelfHostPaperApis(page: Page) {
  const defaultPaper = buildPaper('2512.25072v1', 'Fixture Reader Paper');
  const importedPaper = buildPaper('imported-paper', 'Imported Paper');
  const importedAsset = buildAsset(importedPaper, 1);

  let papers: MockPaper[] = [];
  let assets: MockAsset[] = [];

  await page.route(/\/api\/papers\/upload$/, async (route) => {
    papers = [importedPaper];
    assets = [importedAsset];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: jsonBody({
        success: true,
        data: {
          paper: importedPaper,
          paperId: importedPaper.id,
          assetId: importedAsset.id,
          ocrStatus: 'completed',
          message: null,
        },
      }),
    });
  });

  await page.route(/\/api\/papers(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: jsonBody({
        success: true,
        data: {
          papers,
        },
      }),
    });
  });

  await page.route(/\/api\/v2\/assets(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: jsonBody({
        success: true,
        data: {
          assets,
          total: assets.length,
          limit: 20,
          offset: 0,
        },
      }),
    });
  });

  await page.route(/\/api\/ocr\/.+$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const segments = url.pathname.split('/').filter(Boolean);
    const paperId = segments[2];
    const relativePath = segments.slice(3).join('/');
    const title = paperId === importedPaper.id ? importedPaper.title : defaultPaper.title;

    if (!relativePath) {
      await route.fulfill({ status: 404, body: 'Not Found' });
      return;
    }

    if (request.method() === 'HEAD') {
      const contentType = relativePath === 'pdf'
        ? 'application/pdf'
        : relativePath.endsWith('.md')
          ? 'text/markdown; charset=utf-8'
          : relativePath.startsWith('images/')
            ? 'image/png'
            : 'application/json';
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': contentType,
        },
      });
      return;
    }

    if (relativePath === 'pdf') {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        path: PDF_FIXTURE_PATH,
      });
      return;
    }

    if (relativePath === 'metadata.json') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: jsonBody(buildMetadata(paperId, title)),
      });
      return;
    }

    if (relativePath === 'ocr_result.json') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: jsonBody(buildOcrResult(title)),
      });
      return;
    }

    if (relativePath === 'detections.json') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: jsonBody(buildDetections()),
      });
      return;
    }

    if (relativePath === 'paper.md') {
      await route.fulfill({
        status: 200,
        contentType: 'text/markdown; charset=utf-8',
        body: `# ${title}\n\nImported from the self-host browser flow.`,
      });
      return;
    }

    if (relativePath.startsWith('images/')) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PNG_BUFFER,
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'Not Found' });
  });
}

export async function dismissWorkspaceGate(page: Page) {
  const skipButton = page.getByRole('button', { name: 'Skip to workspace' });
  const isVisible = await skipButton.isVisible({ timeout: 15_000 }).catch(() => false);
  if (isVisible) {
    await skipButton.click();
  }
}
