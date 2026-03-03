/**
 * useArtifactCollector - Automatically Collect Artifacts from Cell Outputs
 *
 * Listens to cell:output and cell:executed events,
 * automatically detects and adds artifacts to ArtifactStore.
 */

import { useEffect, useCallback, useRef } from 'react';
import { on } from '../store/eventBus';
import { useArtifactStore, type DetectedArtifact } from '../store/artifactStore';
import { detectArtifacts, detectAllArtifacts } from '../services/ArtifactDetector';
import { useNotebookStore } from '../store/notebookStore';
import type { Output } from '../types';

interface UseArtifactCollectorOptions {
  /** Whether to enable collection */
  enabled?: boolean;
  /** Whether to clear old artifacts when execution starts */
  clearOnExecute?: boolean;
}

export function useArtifactCollector(options: UseArtifactCollectorOptions = {}) {
  const { enabled = true, clearOnExecute = true } = options;
  
  const addArtifacts = useArtifactStore((state) => state.addArtifacts);
  const clearCellArtifacts = useArtifactStore((state) => state.clearCellArtifacts);
  
  // Get artifacts for deduplication check
  const artifactsRef = useRef<Record<string, DetectedArtifact>>({});
  
  // Subscribe to artifacts changes
  useEffect(() => {
    return useArtifactStore.subscribe((state) => {
      artifactsRef.current = state.artifacts;
    });
  }, []);
  
  const cells = useNotebookStore((state) => state.cells);
  
  // Track processed outputs to avoid duplicates
  const processedOutputs = useRef<Set<string>>(new Set());

  // Handle a single output
  const handleOutput = useCallback((data: { cellId: string; output: Output }) => {
    if (!enabled) return;
    
    const { cellId, output } = data;
    
    // Generate output identifier
    const outputKey = `${cellId}_${JSON.stringify(output).slice(0, 100)}`;
    if (processedOutputs.current.has(outputKey)) {
      return;
    }
    processedOutputs.current.add(outputKey);
    
    // Detect artifacts
    const cell = cells.find(c => c.id === cellId);
    if (!cell || cell.type !== 'code') return;
    
    const codeCell = cell as { outputs: Output[] };
    const outputIndex = codeCell.outputs.length - 1;
    
    const artifacts = detectArtifacts(cellId, output, outputIndex);
    
    if (artifacts.length > 0) {
      console.log(`[ArtifactCollector] Detected ${artifacts.length} artifacts from cell ${cellId}`);
      addArtifacts(artifacts);
    }
  }, [enabled, cells, addArtifacts]);

  // Handle execution start - clear old artifacts
  const handleExecuting = useCallback((data: { cellId: string }) => {
    if (!enabled || !clearOnExecute) return;
    
    const { cellId } = data;
    console.log(`[ArtifactCollector] Clearing artifacts for cell ${cellId}`);
    clearCellArtifacts(cellId);
    
    // Clear processed output cache
    const keysToRemove = Array.from(processedOutputs.current)
      .filter(key => key.startsWith(cellId));
    keysToRemove.forEach(key => processedOutputs.current.delete(key));
  }, [enabled, clearOnExecute, clearCellArtifacts]);

  // Handle execution complete - scan all outputs
  const handleExecuted = useCallback((data: { cellId: string; success: boolean }) => {
    if (!enabled) return;
    
    const { cellId, success } = data;
    if (!success) return;
    
    // Get all outputs for the cell
    const cell = cells.find(c => c.id === cellId);
    if (!cell || cell.type !== 'code') return;
    
    const codeCell = cell as { outputs: Output[] };
    
    // Detect artifacts in all outputs
    const result = detectAllArtifacts(cellId, codeCell.outputs);
    
    if (result.hasArtifacts) {
      console.log(`[ArtifactCollector] Found ${result.artifacts.length} artifacts after execution`);
      
      // Avoid duplicate additions - use current state from ref
      const currentArtifacts = artifactsRef.current;
      const existing = Object.values(currentArtifacts).filter(
        (a: DetectedArtifact) => a.cellId === cellId
      );
      
      const newArtifacts = result.artifacts.filter(
        (a: DetectedArtifact) => !existing.some((e: DetectedArtifact) => 
          e.cellId === a.cellId && 
          e.outputIndex === a.outputIndex &&
          e.mimeType === a.mimeType
        )
      );
      
      if (newArtifacts.length > 0) {
        addArtifacts(newArtifacts);
      }
    }
  }, [enabled, cells, addArtifacts]);

  // Subscribe to events
  useEffect(() => {
    if (!enabled) return;

    const unsubOutput = on('cell:output', handleOutput);
    const unsubExecuting = on('cell:executing', handleExecuting);
    const unsubExecuted = on('cell:executed', handleExecuted);

    return () => {
      unsubOutput();
      unsubExecuting();
      unsubExecuted();
    };
  }, [enabled, handleOutput, handleExecuting, handleExecuted]);

  // Manually scan all cells
  const scanAllCells = useCallback(() => {
    if (!enabled) return;

    let totalArtifacts = 0;
    
    cells.forEach(cell => {
      if (cell.type !== 'code') return;
      
      const codeCell = cell as { id: string; outputs: Output[] };
      const result = detectAllArtifacts(codeCell.id, codeCell.outputs);
      
      if (result.hasArtifacts) {
        addArtifacts(result.artifacts);
        totalArtifacts += result.artifacts.length;
      }
    });

    console.log(`[ArtifactCollector] Scanned all cells, found ${totalArtifacts} artifacts`);
  }, [enabled, cells, addArtifacts]);

  return {
    scanAllCells,
  };
}

export default useArtifactCollector;
