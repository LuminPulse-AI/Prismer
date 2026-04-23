import type {
  BoundingBox,
  Detection,
  DetectionLabel,
  PageContent,
  PageDetection,
  PageMeta,
  PaperMetadata,
} from '@/types/paperContext';
import { writeOCRBinaryRelativeFile } from '@/lib/ocr/storage';

const DEFAULT_VOLCENGINE_LAS_BASE_URL = 'https://operator.las.cn-beijing.volces.com';
const DEFAULT_OPERATOR_ID = 'las_pdf_parse_doubao';
const DEFAULT_OPERATOR_VERSION = 'v1';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_OCR_DPI = 144;

export interface VolcenginePdfParseTaskMetadata {
  task_id: string;
  task_status: string;
  business_code?: string;
  error_msg?: string;
}

export interface VolcenginePageImageHW {
  h: number;
  w: number;
}

export interface VolcengineTextBlock {
  text?: string;
  label?: string;
  box?: {
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
  };
  norm_box?: [number, number, number, number];
  image_url?: string;
  image_path?: string;
  image_filename?: string;
  caption?: string;
  caption_id?: string;
  table_html?: string;
  latex?: string;
}

export interface VolcenginePageDetail {
  page_id: number;
  page_md?: string;
  page_image_hw?: VolcenginePageImageHW;
  text_blocks?: VolcengineTextBlock[];
}

export interface VolcenginePdfParseArtifacts {
  markdown_tos_path?: string;
  image_tos_path?: string;
  detail_tos_path?: string;
  result_preview_url?: string;
}

export interface VolcenginePdfParseResultData {
  markdown?: string;
  detail?: VolcenginePageDetail[] | string;
  artifacts?: VolcenginePdfParseArtifacts;
  num_pages?: number;
}

interface VolcengineSubmitResponse {
  metadata: VolcenginePdfParseTaskMetadata;
}

interface VolcenginePollResponse {
  metadata: VolcenginePdfParseTaskMetadata;
  data?: VolcenginePdfParseResultData;
}

export interface RunVolcenginePdfParseOptions {
  sourceUrl: string;
  baseUrl?: string;
  apiKey?: string;
  operatorId?: string;
  operatorVersion?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface OCRDatasetPayload {
  metadata: PaperMetadata;
  markdown: string;
  ocrResult: {
    success: boolean;
    total_pages: number;
    total_processing_time: number;
    markdown_content: string;
    pages: PageContent[];
  };
  detections: PageDetection[];
}

interface LocalizeVolcengineImagesOptions {
  paperId: string;
  result: VolcenginePdfParseResultData;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferImageExtension(imageUrl: string, contentType?: string | null): string {
  const fromContentType = contentType?.toLowerCase() || '';
  if (fromContentType.includes('png')) return '.png';
  if (fromContentType.includes('webp')) return '.webp';
  if (fromContentType.includes('jpeg') || fromContentType.includes('jpg')) return '.jpg';

  try {
    const parsed = new URL(imageUrl);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.png')) return '.png';
    if (pathname.endsWith('.webp')) return '.webp';
    if (pathname.endsWith('.jpeg')) return '.jpeg';
    if (pathname.endsWith('.jpg')) return '.jpg';
  } catch {
    // Ignore malformed URL and fall back to jpg.
  }

  return '.jpg';
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sanitizeLabel(label?: string): string {
  return label?.trim().toLowerCase().replace(/\s+/g, '_') || 'text';
}

function mapVolcengineLabel(label?: string): DetectionLabel {
  switch (sanitizeLabel(label)) {
    case 'title':
      return 'title';
    case 'subtitle':
    case 'sub_title':
      return 'sub_title';
    case 'image':
    case 'figure':
    case 'picture':
      return 'image';
    case 'image_caption':
    case 'figure_caption':
    case 'caption':
      return 'image_caption';
    case 'table':
      return 'table';
    case 'table_caption':
      return 'table_caption';
    case 'equation':
    case 'formula':
      return 'equation';
    case 'reference':
    case 'bibliography':
      return 'reference';
    case 'header':
      return 'header';
    case 'footer':
      return 'footer';
    case 'chart':
      return 'chart';
    case 'diagram':
      return 'diagram';
    case 'text':
    default:
      return 'text';
  }
}

function buildBoundingBox(block: VolcengineTextBlock): BoundingBox {
  const box = block.box || {};
  return {
    x1: toNumber(box.x0),
    y1: toNumber(box.y0),
    x2: toNumber(box.x1),
    y2: toNumber(box.y1),
    x1_px: toNumber(box.x0),
    y1_px: toNumber(box.y0),
    x2_px: toNumber(box.x1),
    y2_px: toNumber(box.y1),
  };
}

function normalizeDetail(detail: VolcenginePdfParseResultData['detail']): VolcenginePageDetail[] {
  if (Array.isArray(detail)) {
    return detail;
  }

  if (typeof detail === 'string' && detail.trim()) {
    try {
      const parsed = JSON.parse(detail);
      return Array.isArray(parsed) ? (parsed as VolcenginePageDetail[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

export async function localizeVolcengineImages(
  options: LocalizeVolcengineImagesOptions
): Promise<VolcenginePdfParseResultData> {
  const detail = normalizeDetail(options.result.detail);

  await Promise.all(
    detail.map(async (page) => {
      await Promise.all(
        (page.text_blocks || []).map(async (block, index) => {
          if (!block.image_url) return;

          try {
            const response = await fetch(block.image_url);
            if (!response.ok) return;

            const buffer = new Uint8Array(await response.arrayBuffer());
            if (buffer.byteLength === 0) return;

            const extension = inferImageExtension(
              block.image_url,
              response.headers.get('content-type')
            );
            const localRelativePath = `images/page${page.page_id}_img${index}${extension}`;
            await writeOCRBinaryRelativeFile(options.paperId, localRelativePath, buffer);
            block.image_path = localRelativePath;
          } catch {
            // Best-effort localization: leave remote image_url as-is when download fails.
          }
        })
      );
    })
  );

  return {
    ...options.result,
    detail,
  };
}

function deriveTitle(
  paperId: string,
  providedTitle: string | undefined,
  detail: VolcenginePageDetail[],
  markdown: string
): string {
  if (providedTitle?.trim()) {
    return providedTitle.trim();
  }

  for (const page of detail) {
    for (const block of page.text_blocks || []) {
      if (mapVolcengineLabel(block.label) === 'title' && block.text?.trim()) {
        return block.text.trim();
      }
    }
  }

  const heading = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return heading || paperId;
}

function buildPageMeta(page: VolcenginePageDetail): PageMeta {
  return {
    page: page.page_id,
    width: page.page_image_hw?.w || 0,
    height: page.page_image_hw?.h || 0,
    dpi: DEFAULT_OCR_DPI,
  };
}

function buildDetection(page: VolcenginePageDetail, block: VolcengineTextBlock, index: number): Detection {
  const label = mapVolcengineLabel(block.label);
  const detectionId = `p${page.page_id}_${label}_${index}`;
  const metadata = {} as NonNullable<Detection['metadata']> & { image_url?: string };

  if (block.image_path || block.image_filename) {
    metadata.image_path = block.image_path || `images/${block.image_filename}`;
  }
  if (block.image_url) metadata.image_url = block.image_url;
  if (block.caption) metadata.caption = block.caption;
  if (block.caption_id) metadata.caption_id = block.caption_id;
  if (block.table_html) metadata.table_html = block.table_html;
  if (block.latex) metadata.latex = block.latex;

  return {
    id: detectionId,
    label,
    boxes: [buildBoundingBox(block)],
    text: block.text?.trim() || '',
    raw_text: block.text?.trim() || '',
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function buildOCRDatasetFromVolcengineResult(input: {
  paperId: string;
  title?: string;
  result: VolcenginePdfParseResultData;
}): OCRDatasetPayload {
  const detail = normalizeDetail(input.result.detail);
  const markdown = input.result.markdown || detail.map((page) => page.page_md || '').join('\n\n').trim();
  const pageMetas = detail.map(buildPageMeta);
  const detections: PageDetection[] = detail.map((page) => {
    const mappedDetections = (page.text_blocks || []).map((block, index) =>
      buildDetection(page, block, index)
    );

    return {
      page_number: page.page_id,
      detections: mappedDetections,
      image_count: mappedDetections.filter((item) => item.label === 'image').length,
    };
  });

  const pages: PageContent[] = detail.map((page, index) => {
    const pageMeta = pageMetas[index];
    const pageDetections = detections[index]?.detections || [];

    return {
      page_number: page.page_id,
      content: page.page_md || pageDetections.map((item) => item.text).filter(Boolean).join('\n'),
      meta: {
        width: pageMeta.width,
        height: pageMeta.height,
        dpi: pageMeta.dpi,
      },
      detection_count: pageDetections.length,
      image_count: pageDetections.filter((item) => item.label === 'image').length,
    };
  });

  const detectionCount = detections.reduce((sum, page) => sum + page.detections.length, 0);
  const imageCount = detections.reduce(
    (sum, page) => sum + page.detections.filter((item) => item.label === 'image').length,
    0
  );
  const totalPages = input.result.num_pages || pages.length || detail.length;

  const metadata: PaperMetadata = {
    arxiv_id: input.paperId,
    title: deriveTitle(input.paperId, input.title, detail, markdown),
    authors: [],
    abstract: '',
    published: '',
    categories: [],
    ocr_timestamp: new Date().toISOString(),
    total_pages: totalPages,
    total_processing_time: 0,
    total_detections: detectionCount,
    total_images_extracted: imageCount,
    page_metas: pageMetas,
    bidirectional_indexing: {
      detection_ids_count: detectionCount,
      ref_markers_count: 0,
      enabled: false,
    },
    provider: 'volcengine_las_pdf_parse_doubao',
  };

  return {
    metadata,
    markdown,
    ocrResult: {
      success: true,
      total_pages: totalPages,
      total_processing_time: 0,
      markdown_content: markdown,
      pages,
    },
    detections,
  };
}

export async function runVolcenginePdfParse(
  options: RunVolcenginePdfParseOptions
): Promise<VolcenginePdfParseResultData> {
  const apiKey = options.apiKey || process.env.VOLCENGINE_LAS_API_KEY;
  if (!apiKey) {
    throw new Error('VOLCENGINE_LAS_API_KEY is not configured');
  }

  const baseUrl = trimTrailingSlash(options.baseUrl || process.env.VOLCENGINE_LAS_BASE_URL || DEFAULT_VOLCENGINE_LAS_BASE_URL);
  const operatorId = options.operatorId || process.env.VOLCENGINE_LAS_OPERATOR_ID || DEFAULT_OPERATOR_ID;
  const operatorVersion =
    options.operatorVersion || process.env.VOLCENGINE_LAS_OPERATOR_VERSION || DEFAULT_OPERATOR_VERSION;
  const pollIntervalMs = Number(process.env.VOLCENGINE_LAS_POLL_INTERVAL_MS || options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = Number(process.env.VOLCENGINE_LAS_TIMEOUT_MS || options.timeoutMs || DEFAULT_TIMEOUT_MS);

  const submitResponse = await fetch(`${baseUrl}/api/v1/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operator_id: operatorId,
      operator_version: operatorVersion,
      data: {
        url: options.sourceUrl,
      },
    }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`Volcengine submit failed: ${submitResponse.status} ${errorText}`);
  }

  const submitPayload = (await submitResponse.json()) as VolcengineSubmitResponse;
  const taskId = submitPayload.metadata?.task_id;
  if (!taskId) {
    throw new Error('Volcengine submit did not return a task_id');
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    const pollResponse = await fetch(`${baseUrl}/api/v1/poll`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operator_id: operatorId,
        operator_version: operatorVersion,
        task_id: taskId,
      }),
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      throw new Error(`Volcengine poll failed: ${pollResponse.status} ${errorText}`);
    }

    const pollPayload = (await pollResponse.json()) as VolcenginePollResponse;
    const status = pollPayload.metadata?.task_status;

    if (status === 'COMPLETED') {
      if (!pollPayload.data) {
        throw new Error('Volcengine poll completed without result data');
      }
      return pollPayload.data;
    }

    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(pollPayload.metadata?.error_msg || `Volcengine task ended with status ${status}`);
    }
  }

  throw new Error('Volcengine OCR timed out while polling result');
}
