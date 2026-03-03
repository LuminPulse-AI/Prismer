/**
 * ContextBuilder - Context Building Service
 *
 * Responsibilities:
 * - Layered summaries (recent cells in full, older cells summarized)
 * - Incremental updates (dirty flag, caching)
 * - Variable information extraction
 * - Token estimation
 */

import type { 
  Cell, 
  CodeCell, 
  Output, 
  CompiledContext,
  ArtifactSummary,
} from '../types';
import type { DetectedArtifact } from './ArtifactManager';

// ============================================================
// Type Definitions
// ============================================================

export interface ContextConfig {
  // Layering strategy
  recentCellCount: number;      // Number of recent cells to include in full
  maxSummaryLength: number;     // Maximum summary length
  maxTotalTokens: number;       // Maximum context token count

  // Variable information
  includeVariables: boolean;
  maxVariables: number;

  // Artifact information
  includeArtifacts: boolean;
  maxArtifacts: number;

  // Incremental updates
  enableCaching: boolean;
  cacheExpiry: number;          // Cache expiry time (milliseconds)
}

export interface CellVersion {
  cellId: string;
  version: number;
  hash: string;
  summary?: string;
}

export interface ContextCache {
  versions: Map<string, CellVersion>;
  lastBuild: number;
  compiledContext?: CompiledContext;
}

// ============================================================
// ContextBuilder Class
// ============================================================

export class ContextBuilder {
  private config: ContextConfig;
  private cache: ContextCache;
  private isDirty = true;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingCallbacks: Array<(context: CompiledContext) => void> = [];

  constructor(config?: Partial<ContextConfig>) {
    this.config = {
      recentCellCount: 5,
      maxSummaryLength: 100,
      maxTotalTokens: 8000,
      includeVariables: true,
      maxVariables: 20,
      includeArtifacts: true,
      maxArtifacts: 10,
      enableCaching: true,
      cacheExpiry: 30000,  // 30 seconds
      ...config,
    };

    this.cache = {
      versions: new Map(),
      lastBuild: 0,
    };
  }

  /**
   * Mark as dirty (needs rebuild)
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Build context (with debounce)
   */
  buildContextDebounced(
    cells: Cell[],
    artifacts: DetectedArtifact[],
    activeCellId?: string | null,
    delay = 300
  ): Promise<CompiledContext> {
    return new Promise((resolve) => {
      this.pendingCallbacks.push(resolve);

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        const context = this.buildContext(cells, artifacts, activeCellId);
        this.pendingCallbacks.forEach(cb => cb(context));
        this.pendingCallbacks = [];
        this.debounceTimer = null;
      }, delay);
    });
  }

  /**
   * Build context
   */
  buildContext(
    cells: Cell[],
    artifacts: DetectedArtifact[],
    activeCellId?: string | null
  ): CompiledContext {
    // Check cache
    if (this.config.enableCaching && !this.isDirty) {
      const cacheAge = Date.now() - this.cache.lastBuild;
      if (cacheAge < this.config.cacheExpiry && this.cache.compiledContext) {
        return this.cache.compiledContext;
      }
    }

    const codeCells = cells.filter((c): c is CodeCell => c.type === 'code');
    
    // Layering: most recent N cells in full, rest summarized
    const recentCount = this.config.recentCellCount;
    const recentCells = codeCells.slice(-recentCount);
    const olderCells = codeCells.slice(0, -recentCount);

    // Build full information for recent cells
    const recentCellsData = recentCells.map(cell => ({
      id: cell.id,
      source: cell.source,
      outputs: this.summarizeOutputs(cell.outputs),
      executionState: cell.executionState,
    }));

    // Build summaries for older cells (using incremental updates)
    const summaries = olderCells.map(cell => {
      const cached = this.getCachedSummary(cell);
      if (cached) {
        return { id: cell.id, summary: cached };
      }
      
      const summary = this.generateCellSummary(cell);
      this.cacheSummary(cell, summary);
      return { id: cell.id, summary };
    });

    // Extract variable information
    const variables = this.config.includeVariables
      ? this.extractVariables(codeCells).slice(0, this.config.maxVariables)
      : [];

    // Extract error information
    const errors = this.extractErrors(codeCells);

    // Artifact summaries
    const artifactSummaries = this.config.includeArtifacts
      ? this.formatArtifactSummaries(artifacts).slice(0, this.config.maxArtifacts)
      : [];

    const context: CompiledContext = {
      recentCells: recentCellsData,
      summaries,
      variables,
      errors,
      activeCellId: activeCellId || undefined,
      totalCells: cells.length,
      artifacts: artifactSummaries,
      estimatedTokens: this.estimateTokens(recentCellsData, summaries, variables),
    };

    // Update cache
    this.cache.compiledContext = context;
    this.cache.lastBuild = Date.now();
    this.isDirty = false;

    return context;
  }

  /**
   * Generate cell summary
   */
  private generateCellSummary(cell: CodeCell): string {
    const lines = cell.source.split('\n').filter(l => l.trim());
    
    // Extract key information
    const imports: string[] = [];
    const definitions: string[] = [];
    const operations: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Import statements
      if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
        const match = trimmed.match(/(?:import|from)\s+(\w+)/);
        if (match) imports.push(match[1]);
      }
      // Function definitions
      else if (trimmed.startsWith('def ')) {
        const match = trimmed.match(/def\s+(\w+)/);
        if (match) definitions.push(`fn:${match[1]}`);
      }
      // Class definitions
      else if (trimmed.startsWith('class ')) {
        const match = trimmed.match(/class\s+(\w+)/);
        if (match) definitions.push(`class:${match[1]}`);
      }
      // Variable assignment
      else if (trimmed.match(/^\w+\s*=\s*/)) {
        const match = trimmed.match(/^(\w+)\s*=/);
        if (match) operations.push(`${match[1]}=...`);
      }
    }

    // Build summary
    const parts: string[] = [];
    if (imports.length > 0) {
      parts.push(`imports: ${imports.slice(0, 3).join(', ')}${imports.length > 3 ? '...' : ''}`);
    }
    if (definitions.length > 0) {
      parts.push(`defines: ${definitions.slice(0, 2).join(', ')}`);
    }
    if (operations.length > 0) {
      parts.push(`assigns: ${operations.slice(0, 3).join(', ')}`);
    }

    // Add execution state
    if (cell.executionState === 'error') {
      parts.push('[ERROR]');
    } else if (cell.executionCount) {
      parts.push(`[${cell.executionCount}]`);
    }

    const summary = parts.join(' | ');
    return summary.slice(0, this.config.maxSummaryLength);
  }

  /**
   * Get cached summary
   */
  private getCachedSummary(cell: CodeCell): string | undefined {
    if (!this.config.enableCaching) return undefined;

    const cached = this.cache.versions.get(cell.id);
    if (!cached) return undefined;

    const currentHash = this.hashCell(cell);
    if (cached.hash !== currentHash) return undefined;

    return cached.summary;
  }

  /**
   * Cache summary
   */
  private cacheSummary(cell: CodeCell, summary: string): void {
    if (!this.config.enableCaching) return;

    const existing = this.cache.versions.get(cell.id);
    this.cache.versions.set(cell.id, {
      cellId: cell.id,
      version: (existing?.version ?? 0) + 1,
      hash: this.hashCell(cell),
      summary,
    });
  }

  /**
   * Compute cell hash
   */
  private hashCell(cell: CodeCell): string {
    const content = `${cell.source}|${cell.executionState}|${cell.executionCount}`;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Summarize outputs
   */
  private summarizeOutputs(outputs: Output[]): string {
    if (outputs.length === 0) return 'No output';

    const summaries: string[] = [];
    
    for (const output of outputs) {
      switch (output.type) {
        case 'stream':
          const lines = output.text.split('\n').length;
          summaries.push(`${output.name}: ${lines} lines`);
          break;
        case 'execute_result':
          const types = Object.keys(output.data);
          summaries.push(`result: ${types.join(', ')}`);
          break;
        case 'display_data':
          const displayTypes = Object.keys(output.data);
          summaries.push(`display: ${displayTypes.join(', ')}`);
          break;
        case 'error':
          summaries.push(`ERROR: ${output.ename}`);
          break;
      }
    }

    return summaries.join('; ');
  }

  /**
   * Extract variable information
   */
  private extractVariables(
    cells: CodeCell[]
  ): Array<{ name: string; type: string; shape?: string }> {
    const variables: Array<{ name: string; type: string; shape?: string }> = [];
    const seen = new Set<string>();

    // Traverse in reverse to get the latest variable definitions
    for (let i = cells.length - 1; i >= 0; i--) {
      const cell = cells[i];
      if (cell.executionState !== 'success') continue;

      // DataFrame detection
      const dfMatches = cell.source.matchAll(/(\w+)\s*=\s*pd\.(read_\w+|DataFrame)\([^)]*\)/g);
      for (const match of dfMatches) {
        if (!seen.has(match[1])) {
          variables.push({ name: match[1], type: 'DataFrame' });
          seen.add(match[1]);
        }
      }

      // NumPy array detection
      const npMatches = cell.source.matchAll(/(\w+)\s*=\s*np\.(array|zeros|ones|arange|linspace)\([^)]*\)/g);
      for (const match of npMatches) {
        if (!seen.has(match[1])) {
          variables.push({ name: match[1], type: 'ndarray' });
          seen.add(match[1]);
        }
      }

      // List detection
      const listMatches = cell.source.matchAll(/(\w+)\s*=\s*\[/g);
      for (const match of listMatches) {
        if (!seen.has(match[1]) && !match[1].startsWith('_')) {
          variables.push({ name: match[1], type: 'list' });
          seen.add(match[1]);
        }
      }

      // Dict detection
      const dictMatches = cell.source.matchAll(/(\w+)\s*=\s*\{/g);
      for (const match of dictMatches) {
        if (!seen.has(match[1]) && !match[1].startsWith('_')) {
          variables.push({ name: match[1], type: 'dict' });
          seen.add(match[1]);
        }
      }
    }

    return variables;
  }

  /**
   * Extract error information
   */
  private extractErrors(cells: CodeCell[]): string[] {
    const errors: string[] = [];

    for (const cell of cells) {
      if (cell.executionState !== 'error') continue;

      for (const output of cell.outputs) {
        if (output.type === 'error') {
          errors.push(`${output.ename}: ${output.evalue}`);
        }
      }
    }

    return errors.slice(-5);  // Last 5 errors
  }

  /**
   * Format artifact summaries
   */
  private formatArtifactSummaries(
    artifacts: DetectedArtifact[]
  ): ArtifactSummary[] {
    return artifacts.map(a => ({
      id: a.id,
      type: a.type,
      name: `${a.type}_${a.id.slice(0, 8)}`,
      cellId: a.cellId,
      createdAt: a.createdAt,
      description: this.describeArtifact(a),
    }));
  }

  /**
   * Describe artifact
   */
  private describeArtifact(artifact: DetectedArtifact): string {
    switch (artifact.type) {
      case 'image':
        return `Image (${artifact.mimeType})`;
      case 'dataframe':
        const { rows, columns } = artifact.metadata;
        return `Table (${rows || '?'}×${columns || '?'})`;
      case 'chart':
        return `Chart: ${artifact.metadata.title || 'Untitled'}`;
      default:
        return artifact.type;
    }
  }

  /**
   * Estimate token count
   */
  private estimateTokens(
    recentCells: Array<{ source: string; outputs: string }>,
    summaries: Array<{ summary: string }>,
    variables: Array<{ name: string; type: string }>
  ): number {
    // Rough estimate: 4 characters ~ 1 token
    let charCount = 0;

    for (const cell of recentCells) {
      charCount += cell.source.length + cell.outputs.length;
    }

    for (const { summary } of summaries) {
      charCount += summary.length;
    }

    for (const v of variables) {
      charCount += v.name.length + v.type.length + 10;
    }

    return Math.ceil(charCount / 4);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = {
      versions: new Map(),
      lastBuild: 0,
    };
    this.isDirty = true;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedCells: number;
    lastBuild: number;
    isDirty: boolean;
  } {
    return {
      cachedCells: this.cache.versions.size,
      lastBuild: this.cache.lastBuild,
      isDirty: this.isDirty,
    };
  }
}

/**
 * Create a ContextBuilder instance
 */
export function createContextBuilder(
  config?: Partial<ContextConfig>
): ContextBuilder {
  return new ContextBuilder(config);
}

export default ContextBuilder;
