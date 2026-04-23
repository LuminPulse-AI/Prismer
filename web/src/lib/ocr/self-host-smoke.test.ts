import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as uploadPaperRoute } from '../../app/api/papers/upload/route';
import { GET as listPapersRoute } from '../../app/api/papers/route';
import { GET as getOCRFileRoute, HEAD as headOCRFileRoute } from '../../app/api/ocr/[paperId]/[...path]/route';

const TEST_PUBLIC_APP_URL = 'https://prismer-self-host.example.com';
const TEST_VOLCENGINE_BASE_URL = 'https://operator.las.test';

const SAMPLE_DETAIL = [
  {
    page_id: 1,
    page_md: '# Imported Paper\n\nHello from OCR.',
    page_image_hw: {
      w: 1200,
      h: 1600,
    },
    text_blocks: [
      {
        label: 'title',
        text: 'Imported Paper',
        box: { x0: 12, y0: 24, x1: 520, y1: 96 },
      },
      {
        label: 'text',
        text: 'Hello from OCR.',
        box: { x0: 12, y0: 120, x1: 680, y1: 280 },
      },
      {
        label: 'image',
        text: '',
        image_url: 'https://volcengine.example.com/page1-figure.png',
        box: { x0: 32, y0: 320, x1: 520, y1: 760 },
      },
    ],
  },
];

describe('self-host OCR import smoke', () => {
  let tempRoot = '';
  const originalFetch = global.fetch;
  const originalEnv = {
    OCR_DATA_ROOT: process.env.OCR_DATA_ROOT,
    OCR_DATA_ROOTS: process.env.OCR_DATA_ROOTS,
    VOLCENGINE_LAS_API_KEY: process.env.VOLCENGINE_LAS_API_KEY,
    VOLCENGINE_LAS_BASE_URL: process.env.VOLCENGINE_LAS_BASE_URL,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  };

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'prismer-ocr-smoke-'));
    process.env.OCR_DATA_ROOT = tempRoot;
    delete process.env.OCR_DATA_ROOTS;
    process.env.VOLCENGINE_LAS_API_KEY = 'test-las-key';
    process.env.VOLCENGINE_LAS_BASE_URL = TEST_VOLCENGINE_BASE_URL;
    process.env.PUBLIC_APP_URL = TEST_PUBLIC_APP_URL;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.doUnmock('@/lib/services/asset.service');
    vi.resetModules();

    if (originalEnv.OCR_DATA_ROOT === undefined) delete process.env.OCR_DATA_ROOT;
    else process.env.OCR_DATA_ROOT = originalEnv.OCR_DATA_ROOT;

    if (originalEnv.OCR_DATA_ROOTS === undefined) delete process.env.OCR_DATA_ROOTS;
    else process.env.OCR_DATA_ROOTS = originalEnv.OCR_DATA_ROOTS;

    if (originalEnv.VOLCENGINE_LAS_API_KEY === undefined) delete process.env.VOLCENGINE_LAS_API_KEY;
    else process.env.VOLCENGINE_LAS_API_KEY = originalEnv.VOLCENGINE_LAS_API_KEY;

    if (originalEnv.VOLCENGINE_LAS_BASE_URL === undefined) delete process.env.VOLCENGINE_LAS_BASE_URL;
    else process.env.VOLCENGINE_LAS_BASE_URL = originalEnv.VOLCENGINE_LAS_BASE_URL;

    if (originalEnv.PUBLIC_APP_URL === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = originalEnv.PUBLIC_APP_URL;

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
  });

  it('imports a PDF, materializes local OCR files, lists the paper, and serves OCR payloads', async () => {
    const workspaceServiceModule = await import('@/lib/services/workspace.service');
    const collectionServiceModule = await import('@/lib/services/collection.service');
    const ensureCollectionBindingSpy = vi
      .spyOn(workspaceServiceModule.workspaceService, 'ensureCollectionBinding')
      .mockResolvedValue(99);
    const addAssetSpy = vi
      .spyOn(collectionServiceModule.collectionService, 'addAsset')
      .mockResolvedValue({ collectionId: 99, assetId: 1 });

    const createdAssets: Array<Record<string, unknown>> = [];
    const mockAssetService = {
      findBySourceId: vi.fn(async () => null),
      findById: vi.fn(async (id: number) => createdAssets.find((item) => item.id === id) ?? null),
      create: vi.fn(async (input: Record<string, unknown>) => {
        const asset = {
          id: createdAssets.length + 1,
          userId: 1,
          user_id: 1,
          type: 'paper',
          assetType: 'paper',
          asset_type: 'paper',
          title: input.title as string,
          description: (input.description as string | null | undefined) ?? null,
          noteType: null,
          note_type: null,
          source: (input.source as string | null | undefined) ?? 'upload',
          content: null,
          mimeType: (input.mimeType as string | null | undefined) ?? 'application/pdf',
          mime_type: (input.mimeType as string | null | undefined) ?? 'application/pdf',
          storageProvider: (input.storageProvider as string | null | undefined) ?? 'external',
          storage_provider: (input.storageProvider as string | null | undefined) ?? 'external',
          storageKey: null,
          storage_key: null,
          pdfS3Key: null,
          externalUrl: (input.externalUrl as string | null | undefined) ?? null,
          external_url: (input.externalUrl as string | null | undefined) ?? null,
          fileName: (input.fileName as string | null | undefined) ?? 'imported-paper.pdf',
          file_name: (input.fileName as string | null | undefined) ?? 'imported-paper.pdf',
          fileUrl: (input.externalUrl as string | null | undefined) ?? null,
          file_url: (input.externalUrl as string | null | undefined) ?? null,
          metadata: (input.metadata as Record<string, unknown>) ?? {},
          createdAt: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        createdAssets.push(asset);
        return asset;
      }),
      update: vi.fn(async (id: number, _userId: number, input: Record<string, unknown>) => {
        const index = createdAssets.findIndex((item) => item.id === id);
        if (index === -1) return null;

        createdAssets[index] = {
          ...createdAssets[index],
          title: input.title ?? createdAssets[index].title,
          description: input.description ?? createdAssets[index].description,
          source: input.source ?? createdAssets[index].source,
          mimeType: input.mimeType ?? createdAssets[index].mimeType,
          mime_type: input.mimeType ?? createdAssets[index].mime_type,
          storageProvider: input.storageProvider ?? createdAssets[index].storageProvider,
          storage_provider: input.storageProvider ?? createdAssets[index].storage_provider,
          externalUrl: input.externalUrl ?? createdAssets[index].externalUrl,
          external_url: input.externalUrl ?? createdAssets[index].external_url,
          fileName: input.fileName ?? createdAssets[index].fileName,
          file_name: input.fileName ?? createdAssets[index].file_name,
          fileUrl: input.externalUrl ?? createdAssets[index].fileUrl,
          file_url: input.externalUrl ?? createdAssets[index].file_url,
          metadata: input.metadata ?? createdAssets[index].metadata,
        };

        return createdAssets[index];
      }),
      findByUser: vi.fn(async () => ({
        assets: createdAssets,
        total: createdAssets.length,
        limit: 20,
        offset: 0,
      })),
    };

    vi.doMock('@/lib/services/asset.service', () => ({
      assetService: mockAssetService,
    }));

    global.fetch = vi.fn(async (input, init) => {
      const url = String(input);

      if (url === `${TEST_VOLCENGINE_BASE_URL}/api/v1/submit`) {
        const payload = JSON.parse(String(init?.body || '{}')) as {
          data?: { url?: string };
        };

        expect(payload.data?.url).toBe(`${TEST_PUBLIC_APP_URL}/api/ocr/imported-paper/pdf`);

        return new Response(
          JSON.stringify({
            metadata: {
              task_id: 'task-ocr-1',
              task_status: 'PENDING',
              business_code: '200',
              error_msg: '',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url === `${TEST_VOLCENGINE_BASE_URL}/api/v1/poll`) {
        return new Response(
          JSON.stringify({
            metadata: {
              task_id: 'task-ocr-1',
              task_status: 'COMPLETED',
              business_code: '200',
              error_msg: '',
            },
            data: {
              markdown: '# Imported Paper\n\nHello from OCR.',
              num_pages: 1,
              detail: SAMPLE_DETAIL,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url === 'https://volcengine.example.com/page1-figure.png') {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }

      throw new Error(`Unexpected fetch in smoke test: ${url}`);
    }) as typeof fetch;

    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a])], 'imported-paper.pdf', {
        type: 'application/pdf',
      })
    );
    formData.append('processOcr', 'true');
    formData.append('workspaceId', 'ws-import');

    const uploadResponse = await uploadPaperRoute(
      new NextRequest('http://localhost:3000/api/papers/upload', {
        method: 'POST',
        body: formData,
      })
    );

    expect(uploadResponse.ok).toBe(true);
    const uploadPayload = await uploadResponse.json();
    expect(uploadPayload.success).toBe(true);
    expect(uploadPayload.data.assetId).toBe(1);
    expect(uploadPayload.data.ocrStatus).toBe('completed');
    expect(uploadPayload.data.paper.id).toBe('imported-paper');
    expect(uploadPayload.data.paper.hasOCRData).toBe(true);
    expect(uploadPayload.data.paper.pdfPath).toBe('/api/ocr/imported-paper/pdf');
    expect(mockAssetService.create).toHaveBeenCalledTimes(1);
    expect(createdAssets[0]?.metadata).toMatchObject({
      sourceId: 'imported-paper',
      importProvider: 'volcengine',
      ocrStatus: 'completed',
    });
    expect(ensureCollectionBindingSpy).toHaveBeenCalledWith('ws-import');
    expect(addAssetSpy).toHaveBeenCalledWith(99, 1, 1);

    const papersResponse = await listPapersRoute();
    expect(papersResponse.ok).toBe(true);
    const papersPayload = await papersResponse.json();
    expect(papersPayload.success).toBe(true);
    expect(Array.isArray(papersPayload.papers)).toBe(true);
    expect(
      papersPayload.papers.some(
        (paper: { id?: string; title?: string }) =>
          paper.id === 'imported-paper' && paper.title === 'Imported Paper'
      )
    ).toBe(true);

    const { GET: listAssetsRoute } = await import('../../app/api/v2/assets/route');
    const assetsResponse = await listAssetsRoute(
      new NextRequest('http://localhost:3000/api/v2/assets?type=paper')
    );
    expect(assetsResponse.ok).toBe(true);
    const assetsPayload = await assetsResponse.json();
    expect(assetsPayload.success).toBe(true);
    expect(Array.isArray(assetsPayload.data.assets)).toBe(true);
    expect(assetsPayload.data.assets[0]?.metadata?.sourceId).toBe('imported-paper');
    expect(assetsPayload.data.assets[0]?.file_url).toBe('/api/ocr/imported-paper/pdf');

    const { GET: getAssetFileRoute } = await import('../../app/api/v2/assets/[id]/file/route');
    const assetFileResponse = await getAssetFileRoute(
      new NextRequest('http://localhost:3000/api/v2/assets/1/file'),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(assetFileResponse.status).toBe(307);
    expect(assetFileResponse.headers.get('location')).toBe(
      'http://localhost:3000/api/ocr/imported-paper/pdf'
    );

    const metadataResponse = await getOCRFileRoute(
      new NextRequest('http://localhost:3000/api/ocr/imported-paper/metadata.json'),
      { params: Promise.resolve({ paperId: 'imported-paper', path: ['metadata.json'] }) }
    );
    expect(metadataResponse.ok).toBe(true);
    const metadata = await metadataResponse.json();
    expect(metadata.title).toBe('Imported Paper');
    expect(metadata.total_pages).toBe(1);

    const detectionsResponse = await getOCRFileRoute(
      new NextRequest('http://localhost:3000/api/ocr/imported-paper/detections.json'),
      { params: Promise.resolve({ paperId: 'imported-paper', path: ['detections.json'] }) }
    );
    expect(detectionsResponse.ok).toBe(true);
    const detections = await detectionsResponse.json();
    expect(Array.isArray(detections)).toBe(true);
    expect(detections[0]?.detections[0]?.label).toBe('title');
    expect(detections[0]?.detections[2]?.metadata?.image_path).toBe('images/page1_img2.png');

    const markdownResponse = await getOCRFileRoute(
      new NextRequest('http://localhost:3000/api/ocr/imported-paper/paper.md'),
      { params: Promise.resolve({ paperId: 'imported-paper', path: ['paper.md'] }) }
    );
    expect(markdownResponse.ok).toBe(true);
    expect(await markdownResponse.text()).toContain('Hello from OCR.');

    const pdfHeadResponse = await headOCRFileRoute(
      new NextRequest('http://localhost:3000/api/ocr/imported-paper/pdf', { method: 'HEAD' }),
      { params: Promise.resolve({ paperId: 'imported-paper', path: ['pdf'] }) }
    );
    expect(pdfHeadResponse.ok).toBe(true);
    expect(pdfHeadResponse.headers.get('content-type')).toContain('application/pdf');

    const pdfGetResponse = await getOCRFileRoute(
      new NextRequest('http://localhost:3000/api/ocr/imported-paper/pdf'),
      { params: Promise.resolve({ paperId: 'imported-paper', path: ['pdf'] }) }
    );
    expect(pdfGetResponse.ok).toBe(true);
    expect((await pdfGetResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const imageResponse = await getOCRFileRoute(
      new NextRequest('http://localhost:3000/api/ocr/imported-paper/images/page1_img2.png'),
      { params: Promise.resolve({ paperId: 'imported-paper', path: ['images', 'page1_img2.png'] }) }
    );
    expect(imageResponse.ok).toBe(true);
    expect(imageResponse.headers.get('content-type')).toContain('image/png');
    expect((await imageResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
