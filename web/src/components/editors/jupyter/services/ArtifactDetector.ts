/**
 * ArtifactDetector - Detect and Extract Artifacts from Cell Outputs
 *
 * Supported detections:
 * - Images (PNG, JPEG, SVG, GIF)
 * - DataFrames (HTML tables)
 * - Plotly charts
 * - Matplotlib charts
 * - File references
 */

import type { Output, MimeBundle } from '../types';
import type { DetectedArtifact, ArtifactType, ArtifactMetadata } from '../store/artifactStore';

// ============================================================
// Type Definitions
// ============================================================

export interface DetectionResult {
  artifacts: DetectedArtifact[];
  hasArtifacts: boolean;
}

// ============================================================
// ArtifactDetector
// ============================================================

export class ArtifactDetector {
  private idCounter = 0;

  /**
   * Detect artifacts from a single output
   */
  detect(cellId: string, output: Output, outputIndex: number): DetectedArtifact[] {
    const artifacts: DetectedArtifact[] = [];

    if (output.type === 'display_data' || output.type === 'execute_result') {
      const data = output.data as MimeBundle;

      // Detect PNG images
      if (data['image/png']) {
        const artifact = this.createImageArtifact(
          cellId, outputIndex, 'image/png', data['image/png'] as string
        );
        if (artifact) artifacts.push(artifact);
      }

      // Detect JPEG images
      if (data['image/jpeg']) {
        const artifact = this.createImageArtifact(
          cellId, outputIndex, 'image/jpeg', data['image/jpeg'] as string
        );
        if (artifact) artifacts.push(artifact);
      }

      // Detect SVG images
      if (data['image/svg+xml']) {
        const artifact = this.createSVGArtifact(
          cellId, outputIndex, data['image/svg+xml'] as string
        );
        if (artifact) artifacts.push(artifact);
      }

      // Detect GIF images
      if (data['image/gif']) {
        const artifact = this.createImageArtifact(
          cellId, outputIndex, 'image/gif', data['image/gif'] as string
        );
        if (artifact) artifacts.push(artifact);
      }

      // Detect Plotly charts
      if (data['application/vnd.plotly.v1+json']) {
        const artifact = this.createPlotlyArtifact(
          cellId, outputIndex, data['application/vnd.plotly.v1+json'] as object
        );
        if (artifact) artifacts.push(artifact);
      }

      // Detect DataFrame (HTML table)
      if (data['text/html']) {
        const html = data['text/html'] as string;
        if (this.isDataFrame(html)) {
          const artifact = this.createDataFrameArtifact(
            cellId, outputIndex, html
          );
          if (artifact) artifacts.push(artifact);
        }
      }
    }

    return artifacts;
  }

  /**
   * Detect all artifacts from multiple outputs
   */
  detectAll(cellId: string, outputs: Output[]): DetectionResult {
    const artifacts: DetectedArtifact[] = [];

    outputs.forEach((output, index) => {
      const detected = this.detect(cellId, output, index);
      artifacts.push(...detected);
    });

    return {
      artifacts,
      hasArtifacts: artifacts.length > 0,
    };
  }

  /**
   * Create image artifact
   */
  private createImageArtifact(
    cellId: string,
    outputIndex: number,
    mimeType: string,
    base64Data: string
  ): DetectedArtifact | null {
    if (!base64Data) return null;

    const id = this.generateId();
    const size = this.estimateBase64Size(base64Data);
    const dimensions = this.extractImageDimensions(base64Data, mimeType);

    return {
      id,
      name: `Image ${id.slice(-4)}`,
      cellId,
      outputIndex,
      type: 'image',
      mimeType,
      data: `data:${mimeType};base64,${base64Data}`,
      size,
      thumbnail: this.createThumbnail(base64Data, mimeType),
      metadata: {
        width: dimensions.width,
        height: dimensions.height,
        format: mimeType.split('/')[1].toUpperCase(),
      },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create SVG artifact
   */
  private createSVGArtifact(
    cellId: string,
    outputIndex: number,
    svgContent: string
  ): DetectedArtifact | null {
    if (!svgContent) return null;

    const id = this.generateId();
    const dimensions = this.extractSVGDimensions(svgContent);

    return {
      id,
      name: `SVG ${id.slice(-4)}`,
      cellId,
      outputIndex,
      type: 'image',
      mimeType: 'image/svg+xml',
      data: svgContent,
      size: new Blob([svgContent]).size,
      metadata: {
        width: dimensions.width,
        height: dimensions.height,
        format: 'SVG',
      },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create Plotly chart artifact
   */
  private createPlotlyArtifact(
    cellId: string,
    outputIndex: number,
    plotlyData: object
  ): DetectedArtifact | null {
    if (!plotlyData) return null;

    const id = this.generateId();
    const dataStr = JSON.stringify(plotlyData);

    return {
      id,
      name: `Chart ${id.slice(-4)}`,
      cellId,
      outputIndex,
      type: 'chart',
      mimeType: 'application/vnd.plotly.v1+json',
      data: plotlyData,
      size: new Blob([dataStr]).size,
      metadata: {
        format: 'Plotly',
      },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create DataFrame artifact
   */
  private createDataFrameArtifact(
    cellId: string,
    outputIndex: number,
    html: string
  ): DetectedArtifact | null {
    if (!html) return null;

    const id = this.generateId();
    const dimensions = this.extractTableDimensions(html);

    return {
      id,
      name: `DataFrame ${id.slice(-4)}`,
      cellId,
      outputIndex,
      type: 'dataframe',
      mimeType: 'text/html',
      data: html,
      size: new Blob([html]).size,
      metadata: {
        rows: dimensions.rows,
        columns: dimensions.columns,
        format: 'DataFrame',
      },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Check if HTML is a DataFrame
   */
  private isDataFrame(html: string): boolean {
    // pandas DataFrame characteristics
    if (html.includes('dataframe') || html.includes('DataFrame')) {
      return true;
    }
    // Generic table detection
    if (html.includes('<table') && html.includes('<thead') && html.includes('<tbody')) {
      return true;
    }
    return false;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    this.idCounter++;
    return `artifact_${Date.now()}_${this.idCounter}`;
  }

  /**
   * Estimate Base64 data size
   */
  private estimateBase64Size(base64: string): number {
    // Base64 encoding increases size by ~33%
    return Math.floor((base64.length * 3) / 4);
  }

  /**
   * Extract image dimensions (simplified implementation)
   */
  private extractImageDimensions(base64: string, mimeType: string): { width?: number; height?: number } {
    // For PNG, dimensions could be extracted from the header
    // Simplified here, returns unknown
    return {};
  }

  /**
   * Extract SVG dimensions
   */
  private extractSVGDimensions(svg: string): { width?: number; height?: number } {
    const widthMatch = svg.match(/width="(\d+)/);
    const heightMatch = svg.match(/height="(\d+)/);
    
    return {
      width: widthMatch ? parseInt(widthMatch[1], 10) : undefined,
      height: heightMatch ? parseInt(heightMatch[1], 10) : undefined,
    };
  }

  /**
   * Extract table dimensions
   */
  private extractTableDimensions(html: string): { rows?: number; columns?: number } {
    const rowMatches = html.match(/<tr/g);
    const headerMatches = html.match(/<th/g);
    
    return {
      rows: rowMatches ? Math.max(0, rowMatches.length - 1) : undefined, // Subtract header row
      columns: headerMatches ? headerMatches.length : undefined,
    };
  }

  /**
   * Create thumbnail (simplified implementation)
   */
  private createThumbnail(base64: string, mimeType: string): string | undefined {
    // Use original image as thumbnail directly
    // Production environments can use canvas for scaling
    return `data:${mimeType};base64,${base64}`;
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const artifactDetector = new ArtifactDetector();

export function detectArtifacts(cellId: string, output: Output, outputIndex: number): DetectedArtifact[] {
  return artifactDetector.detect(cellId, output, outputIndex);
}

export function detectAllArtifacts(cellId: string, outputs: Output[]): DetectionResult {
  return artifactDetector.detectAll(cellId, outputs);
}
