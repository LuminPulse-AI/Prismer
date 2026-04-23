/**
 * Paper Context Provider
 * 
 * Responsible for loading and managing paper context data.
 * Supports loading from files, URLs, ArXiv, and other sources.
 */

import {
  PDFSource,
  PaperContext,
  PaperMetadata,
  OCRResult,
  PageDetection,
  ImageAsset,
  IPaperContextProvider,
  createEmptyPaperContext,
} from '@/types/paperContext';
import { normalizeDetectionsPayload } from '@/lib/ocr/normalize';

/**
 * Base path for OCR data
 * Uses API routes, supports switching between local and remote data sources
 */
const OCR_DATA_BASE_PATH = '/api/ocr';

/**
 * Paper Context Provider implementation
 */
export class PaperContextProvider implements IPaperContextProvider {
  private basePath: string;

  constructor(basePath: string = OCR_DATA_BASE_PATH) {
    this.basePath = basePath;
  }

  /**
   * Load full context from PDF Source
   *
   * Three-level fallback chain:
   * - L3 hires: detections + markdown + images (full overlay)
   * - L2 fast:  markdown available but no detections (basic AI analysis)
   * - L1 raw:   no OCR data (PDF.js direct rendering)
   */
  async loadContext(source: PDFSource): Promise<PaperContext> {
    const context = createEmptyPaperContext(source);
    context.loadingState = 'loading_pdf';

    try {
      if (source.arxivId) {
        context.loadingState = 'loading_ocr';
        const ocrData = await this.loadOCRData(source.arxivId);

        if (ocrData && ocrData.detections.length > 0) {
          // L3 hires: full detection overlay + images
          context.metadata = ocrData.metadata;
          context.detections = ocrData.detections;
          context.hasOCRData = true;
          context.ocrLevel = 'L3_hires';

          if (ocrData.ocrResult) {
            context.markdown = ocrData.ocrResult.markdown_content;
            context.pages = ocrData.ocrResult.pages;
          }

          context.images = await this.loadImageAssets(source.arxivId, ocrData.detections);
        } else if (ocrData?.ocrResult?.markdown_content) {
          // L2 fast: markdown available but no detections
          context.metadata = ocrData.metadata;
          context.markdown = ocrData.ocrResult.markdown_content;
          context.pages = ocrData.ocrResult.pages;
          context.hasOCRData = true;
          context.ocrLevel = 'L2_fast';
        } else {
          // L2 fallback: try fetching just paper.md
          const mdFallback = await this.loadMarkdownFallback(source.arxivId);
          if (mdFallback) {
            context.metadata = ocrData?.metadata ?? null;
            context.markdown = mdFallback;
            context.hasOCRData = true;
            context.ocrLevel = 'L2_fast';
          }
          // else: L1 raw (default from createEmptyPaperContext)
        }
      }
      // No arxivId → stays L1_raw (default)

      context.loadingState = 'ready';
      return context;
    } catch (error) {
      context.loadingState = 'error';
      context.error = error instanceof Error ? error.message : 'Unknown error';
      return context;
    }
  }

  /**
   * Load OCR preprocessed data
   * Loads from public/data/output directory
   */
  async loadOCRData(arxivId: string): Promise<{
    metadata: PaperMetadata | null;
    ocrResult: OCRResult | null;
    detections: PageDetection[];
  } | null> {
    try {
      // Use API route format: /api/ocr/{arxivId}/{file}
      const basePath = `${this.basePath}/${arxivId}`;

      // Load all data files in parallel
      const [metadataRes, ocrRes, detectionsRes] = await Promise.allSettled([
        fetch(`${basePath}/metadata.json`),
        fetch(`${basePath}/ocr_result.json`),
        fetch(`${basePath}/detections.json`),
      ]);

      let metadata: PaperMetadata | null = null;
      let ocrResult: OCRResult | null = null;
      let detections: PageDetection[] = [];

      // Parse metadata
      if (metadataRes.status === 'fulfilled' && metadataRes.value.ok) {
        metadata = await metadataRes.value.json();
      }

      // Parse OCR result
      if (ocrRes.status === 'fulfilled' && ocrRes.value.ok) {
        ocrResult = await ocrRes.value.json();
      }

      // Parse detection results
      if (detectionsRes.status === 'fulfilled' && detectionsRes.value.ok) {
        detections = normalizeDetectionsPayload(await detectionsRes.value.json());
      }

      // If no data is available, return null
      if (!metadata && !ocrResult && detections.length === 0) {
        return null;
      }

      return { metadata, ocrResult, detections };
    } catch (error) {
      console.error('Failed to load OCR data:', error);
      return null;
    }
  }

  /**
   * L2 fallback: Load markdown content separately (when full OCR data is unavailable)
   */
  private async loadMarkdownFallback(arxivId: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.basePath}/${arxivId}/paper.md`);
      if (res.ok) return await res.text();
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if preprocessed data exists
   */
  async hasPreprocessedData(arxivId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.basePath}/${arxivId}/metadata.json`, {
        method: 'HEAD',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Load image asset list
   * Loads from public/data/output/{arxivId}/images
   */
  private async loadImageAssets(
    arxivId: string,
    detections: PageDetection[]
  ): Promise<ImageAsset[]> {
    const images: ImageAsset[] = [];
    // Use API route format: /api/ocr/{arxivId}/images/{filename}
    const basePath = `${this.basePath}/${arxivId}/images`;

    for (const page of detections) {
      const imageDetections = page.detections.filter(d => d.label === 'image');
      
      for (let i = 0; i < imageDetections.length; i++) {
        const detection = imageDetections[i];
        const imagePath = detection.metadata?.image_path;
        const filename = imagePath?.split('/').pop() || `page${page.page_number}_img${i}.jpg`;
        
        images.push({
          id: `${page.page_number}-${i}`,
          page: page.page_number,
          filename,
          path: imagePath ? `${this.basePath}/${arxivId}/${imagePath}` : `${basePath}/${filename}`,
          bbox: detection.boxes[0],
          caption: this.findCaption(page.detections, detection),
        });
      }
    }

    return images;
  }

  /**
   * Find image caption
   */
  private findCaption(
    detections: PageDetection['detections'],
    imageDetection: PageDetection['detections'][0]
  ): string | undefined {
    // Find the caption immediately following the image
    const imageBox = imageDetection.boxes[0];
    if (!imageBox) return undefined;

    const captions = detections.filter(d => d.label === 'image_caption');
    
    // Find the closest caption below the image
    let closestCaption: typeof captions[0] | undefined;
    let minDistance = Infinity;

    for (const caption of captions) {
      const captionBox = caption.boxes[0];
      if (!captionBox) continue;

      // Caption should be below the image
      if (captionBox.y1_px > imageBox.y2_px) {
        const distance = captionBox.y1_px - imageBox.y2_px;
        if (distance < minDistance && distance < 100) { // 100px threshold
          minDistance = distance;
          closestCaption = caption;
        }
      }
    }

    return closestCaption?.raw_text;
  }
}

/**
 * Create default Provider instance
 */
export function createPaperContextProvider(basePath?: string): IPaperContextProvider {
  return new PaperContextProvider(basePath);
}

/**
 * Singleton instance
 */
let defaultProvider: IPaperContextProvider | null = null;

export function getDefaultPaperContextProvider(): IPaperContextProvider {
  if (!defaultProvider) {
    defaultProvider = new PaperContextProvider();
  }
  return defaultProvider;
}
