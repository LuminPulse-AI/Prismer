'use client';

/**
 * useNotesAutoSave
 *
 * Periodically saves ai-editor content to the workspace collection
 * as a note asset. Runs every 5 seconds, skips if content hasn't changed.
 * Uses upsert pattern: first save creates an asset, subsequent saves
 * update the same asset.
 */

import { useEffect, useRef } from 'react';
import { useComponentStore } from '../stores/componentStore';
import { useAgentInstanceStore } from '../stores/agentInstanceStore';
import { createLogger } from '@/lib/logger';

const log = createLogger('NotesAutoSave');

const SAVE_INTERVAL_MS = 5000; // 5 seconds

export function useNotesAutoSave(): void {
  const workspaceId = useAgentInstanceStore((s) => s.workspaceId);
  const lastSavedRef = useRef<string | null>(null);
  const assetIdRef = useRef<number | null>(null);

  useEffect(() => {
    lastSavedRef.current = null;
    assetIdRef.current = null;

    if (!workspaceId) return;

    const interval = setInterval(async () => {
      const editorState = useComponentStore.getState().componentStates['ai-editor'];
      const content = editorState?.content as string | undefined;

      // Skip if no content or unchanged
      if (!content || content === lastSavedRef.current) return;

      try {
        const response = await fetch(`/api/workspace/${workspaceId}/notes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            assetId: assetIdRef.current,
          }),
        });

        const result = await response.json();
        if (result.success) {
          lastSavedRef.current = content;
          if (result.data?.assetId) {
            assetIdRef.current = result.data.assetId;
          }
          log.debug('Notes auto-saved', {
            workspaceId,
            assetId: assetIdRef.current,
            contentLength: content.length,
          });
        }
      } catch (err) {
        log.warn('Notes auto-save failed', {
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [workspaceId]);
}
