/**
 * ArtifactManager - Artifact Management Service
 *
 * Responsibilities:
 * - Automatically detect artifacts in outputs (images, DataFrames, charts)
 * - Artifact metadata management
 * - Manual persistence (upload to storage)
 * - Export functionality (ZIP packaging)
 */

import type { Output, Artifact, ArtifactType, MimeBundle } from '../types';

// ============================================================
// Type Definitions
// ============================================================

export interface DetectedArtifact {
  id: string;
  name?: string;
  cellId: string;
  outputIndex: number;
  type: ArtifactType;
  mimeType: string;
  data: unknown;
  size: number;
  thumbnail?: string;
  metadata: ArtifactMetadata;
  createdAt: string;
}

export interface ArtifactMetadata {
  width?: number;
  height?: number;
  rows?: number;
  columns?: number;
  columnNames?: string[];
  chartType?: string;
  title?: string;
}

export interface ArtifactManagerConfig {
  autoDetect: boolean;
  generateThumbnails: boolean;
  thumbnailMaxSize: number;
  maxArtifactSize: number;  // bytes
  supportedTypes: ArtifactType[];
}

export interface PersistenceOptions {
  uploadUrl: string;
  headers?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

export interface ExportOptions {
  format: 'zip' | 'json';
  includeData: boolean;
  includeThumbnails: boolean;
}

// ============================================================
// MIME Type Mapping
// ============================================================

const MIME_TO_ARTIFACT_TYPE: Record<string, ArtifactType> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/svg+xml': 'image',
  'image/gif': 'image',
  'text/html': 'dataframe',  // pandas DataFrame HTML
  'application/vnd.plotly.v1+json': 'chart',
  'application/vnd.vegalite.v4+json': 'chart',
  'application/vnd.vega.v5+json': 'chart',
};

const ARTIFACT_EXTENSIONS: Partial<Record<ArtifactType, string>> = {
  image: 'png',
  dataframe: 'html',
  chart: 'json',
  file: 'bin',
};

function getArtifactExtension(type: ArtifactType): string {
  return ARTIFACT_EXTENSIONS[type] || 'bin';
}

// ============================================================
// ArtifactManager Class
// ============================================================

export class ArtifactManager {
  private config: ArtifactManagerConfig;
  private artifacts: Map<string, DetectedArtifact> = new Map();

  constructor(config?: Partial<ArtifactManagerConfig>) {
    this.config = {
      autoDetect: true,
      generateThumbnails: true,
      thumbnailMaxSize: 200,
      maxArtifactSize: 50 * 1024 * 1024,  // 50MB
      supportedTypes: ['image', 'dataframe', 'chart'],
      ...config,
    };
  }

  /**
   * Detect artifacts from outputs
   */
  detectArtifacts(cellId: string, outputs: Output[]): DetectedArtifact[] {
    if (!this.config.autoDetect) return [];

    const detected: DetectedArtifact[] = [];

    outputs.forEach((output, index) => {
      if (output.type === 'display_data' || output.type === 'execute_result') {
        const data = output.data as MimeBundle;
        const artifacts = this.extractArtifactsFromMimeBundle(cellId, index, data);
        detected.push(...artifacts);
      }
    });

    // Store detected artifacts
    detected.forEach(artifact => {
      this.artifacts.set(artifact.id, artifact);
    });

    return detected;
  }

  /**
   * Extract artifacts from MIME bundle
   */
  private extractArtifactsFromMimeBundle(
    cellId: string,
    outputIndex: number,
    data: MimeBundle
  ): DetectedArtifact[] {
    const artifacts: DetectedArtifact[] = [];

    for (const [mimeType, content] of Object.entries(data)) {
      const artifactType = MIME_TO_ARTIFACT_TYPE[mimeType];
      
      if (!artifactType || !this.config.supportedTypes.includes(artifactType)) {
        continue;
      }

      // Special handling: check if HTML is a DataFrame
      if (mimeType === 'text/html' && typeof content === 'string') {
        if (!this.isDataFrameHtml(content)) {
          continue;  // Skip non-DataFrame HTML
        }
      }

      const size = this.calculateSize(content);
      if (size > this.config.maxArtifactSize) {
        console.warn(`Artifact too large (${size} bytes), skipping`);
        continue;
      }

      const artifact: DetectedArtifact = {
        id: crypto.randomUUID(),
        cellId,
        outputIndex,
        type: artifactType,
        mimeType,
        data: content,
        size,
        metadata: this.extractMetadata(artifactType, mimeType, content),
        createdAt: new Date().toISOString(),
      };

      // Generate thumbnail
      if (this.config.generateThumbnails && artifactType === 'image') {
        artifact.thumbnail = this.generateThumbnail(mimeType, content as string);
      }

      artifacts.push(artifact);
    }

    return artifacts;
  }

  /**
   * Check if HTML is a DataFrame
   */
  private isDataFrameHtml(html: string): boolean {
    return html.includes('dataframe') || 
           html.includes('class="dataframe"') ||
           (html.includes('<table') && html.includes('<thead'));
  }

  /**
   * Extract metadata
   */
  private extractMetadata(
    type: ArtifactType,
    mimeType: string,
    content: unknown
  ): ArtifactMetadata {
    const metadata: ArtifactMetadata = {};

    if (type === 'dataframe' && typeof content === 'string') {
      // Extract row and column info from HTML table
      const rowMatch = content.match(/<tr>/g);
      const colMatch = content.match(/<th[^>]*>/g);
      
      if (rowMatch) {
        metadata.rows = rowMatch.length - 1;  // Subtract header row
      }
      if (colMatch) {
        metadata.columns = colMatch.length;
      }

      // Extract column names
      const headerMatch = content.match(/<th[^>]*>([^<]+)<\/th>/g);
      if (headerMatch) {
        metadata.columnNames = headerMatch
          .map(h => h.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean);
      }
    }

    if (type === 'chart' && typeof content === 'object') {
      const chartData = content as { layout?: { title?: { text?: string } } };
      metadata.chartType = 'plotly';
      metadata.title = chartData.layout?.title?.text;
    }

    return metadata;
  }

  /**
   * Generate thumbnail (base64)
   */
  private generateThumbnail(mimeType: string, base64Data: string): string {
    // Simplified implementation: return prefix of original data as identifier
    // Production should use canvas compression
    return base64Data.slice(0, 100);
  }

  /**
   * Calculate data size
   */
  private calculateSize(content: unknown): number {
    if (typeof content === 'string') {
      return new Blob([content]).size;
    }
    return new Blob([JSON.stringify(content)]).size;
  }

  /**
   * Get all artifacts
   */
  getAllArtifacts(): DetectedArtifact[] {
    return Array.from(this.artifacts.values());
  }

  /**
   * Get artifacts for a specific cell
   */
  getArtifactsByCell(cellId: string): DetectedArtifact[] {
    return Array.from(this.artifacts.values())
      .filter(a => a.cellId === cellId);
  }

  /**
   * Get artifacts by type
   */
  getArtifactsByType(type: ArtifactType): DetectedArtifact[] {
    return Array.from(this.artifacts.values())
      .filter(a => a.type === type);
  }

  /**
   * Remove artifact
   */
  removeArtifact(id: string): boolean {
    return this.artifacts.delete(id);
  }

  /**
   * Clear all artifacts
   */
  clearAll(): void {
    this.artifacts.clear();
  }

  /**
   * Persist artifact (upload)
   */
  async persistArtifact(
    id: string,
    options: PersistenceOptions
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const artifact = this.artifacts.get(id);
    if (!artifact) {
      return { success: false, error: 'Artifact not found' };
    }

    try {
      const formData = new FormData();
      
      // Create Blob
      let blob: Blob;
      if (typeof artifact.data === 'string') {
        if (artifact.mimeType.startsWith('image/')) {
          // Base64 image
          const binary = atob(artifact.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          blob = new Blob([bytes], { type: artifact.mimeType });
        } else {
          blob = new Blob([artifact.data], { type: artifact.mimeType });
        }
      } else {
        blob = new Blob([JSON.stringify(artifact.data)], { type: 'application/json' });
      }

      const extension = getArtifactExtension(artifact.type);
      const filename = `artifact_${artifact.id.slice(0, 8)}.${extension}`;
      formData.append('file', blob, filename);
      formData.append('metadata', JSON.stringify({
        id: artifact.id,
        cellId: artifact.cellId,
        type: artifact.type,
        mimeType: artifact.mimeType,
        metadata: artifact.metadata,
        createdAt: artifact.createdAt,
      }));

      const response = await fetch(options.uploadUrl, {
        method: 'POST',
        headers: options.headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      return { success: true, url: result.url };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Export artifacts as ZIP
   * Requires jszip: npm install jszip
   */
  async exportAsZip(
    artifactIds?: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: Partial<ExportOptions>
  ): Promise<Blob> {
    type ZipLikeInstance = {
      file: (name: string, data: unknown, options?: Record<string, unknown>) => void;
      generateAsync: (options: Record<string, unknown>) => Promise<unknown>;
    };
    type ZipLikeConstructor = new () => ZipLikeInstance;

    // Dynamically import jszip (optional dependency)
    let JSZipClass: ZipLikeConstructor;
    try {
      // @ts-ignore - jszip is an optional dependency
      const module = await import(/* webpackIgnore: true */ 'jszip');
      JSZipClass = module.default || module;
    } catch {
      throw new Error('jszip not installed. Run: npm install jszip');
    }
    const zip = new JSZipClass();

    const artifacts = artifactIds
      ? artifactIds.map(id => this.artifacts.get(id)).filter(Boolean) as DetectedArtifact[]
      : this.getAllArtifacts();

    // Add artifacts to ZIP
    artifacts.forEach((artifact, index) => {
      const extension = getArtifactExtension(artifact.type);
      const filename = `${artifact.type}_${index + 1}.${extension}`;

      if (typeof artifact.data === 'string') {
        if (artifact.mimeType.startsWith('image/')) {
          // Base64 image -> binary
          zip.file(filename, artifact.data, { base64: true });
        } else {
          zip.file(filename, artifact.data);
        }
      } else {
        zip.file(filename, JSON.stringify(artifact.data, null, 2));
      }
    });

    // Add metadata manifest
    const manifest = artifacts.map(a => ({
      id: a.id,
      cellId: a.cellId,
      type: a.type,
      mimeType: a.mimeType,
      size: a.size,
      metadata: a.metadata,
      createdAt: a.createdAt,
    }));
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const generated = await zip.generateAsync({ type: 'blob' });
    if (!(generated instanceof Blob)) {
      throw new Error('jszip returned an unexpected export type');
    }
    return generated;
  }

  /**
   * Download a single artifact
   */
  downloadArtifact(id: string, filename?: string): void {
    const artifact = this.artifacts.get(id);
    if (!artifact) return;

    let blob: Blob;
    if (typeof artifact.data === 'string') {
      if (artifact.mimeType.startsWith('image/')) {
        const binary = atob(artifact.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: artifact.mimeType });
      } else {
        blob = new Blob([artifact.data], { type: artifact.mimeType });
      }
    } else {
      blob = new Blob([JSON.stringify(artifact.data, null, 2)], { type: 'application/json' });
    }

    const extension = ARTIFACT_EXTENSIONS[artifact.type] || 'bin';
    const defaultFilename = `artifact_${artifact.id.slice(0, 8)}.${extension}`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Get artifact summaries (for Agent context)
   */
  getArtifactSummaries(): Array<{
    id: string;
    cellId: string;
    type: ArtifactType;
    summary: string;
  }> {
    return Array.from(this.artifacts.values()).map(a => ({
      id: a.id,
      cellId: a.cellId,
      type: a.type,
      summary: this.formatArtifactSummary(a),
    }));
  }

  /**
   * Format artifact summary
   */
  private formatArtifactSummary(artifact: DetectedArtifact): string {
    switch (artifact.type) {
      case 'image':
        return `Image (${artifact.mimeType}, ${this.formatSize(artifact.size)})`;
      case 'dataframe':
        const { rows, columns } = artifact.metadata;
        return `DataFrame (${rows || '?'} rows × ${columns || '?'} columns)`;
      case 'chart':
        return `Chart: ${artifact.metadata.title || 'Untitled'} (${artifact.metadata.chartType || 'unknown'})`;
      default:
        return `${artifact.type} (${this.formatSize(artifact.size)})`;
    }
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Create an ArtifactManager instance
 */
export function createArtifactManager(
  config?: Partial<ArtifactManagerConfig>
): ArtifactManager {
  return new ArtifactManager(config);
}

export default ArtifactManager;
