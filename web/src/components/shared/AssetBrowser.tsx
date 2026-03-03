/**
 * AssetBrowser - Shared asset browser
 *
 * A CommandPalette-style pop-up file browser.
 * Used by components without file management (Notes, AG Grid, Jupyter) to open/import workspace assets.
 *
 * Features:
 * - Search assets (papers, notes)
 * - Category filtering
 * - Selection callback
 * - Cmd+O keyboard shortcut binding (implemented by the caller)
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, FileText, StickyNote, X, Loader2 } from 'lucide-react';

// ============================================================
// Types
// ============================================================

export interface AssetItem {
  id: number;
  type: 'paper' | 'note';
  title: string;
  description?: string;
  createdAt?: string;
}

export interface AssetBrowserProps {
  /** Whether the browser is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Asset selection callback */
  onSelect: (asset: AssetItem) => void;
  /** Filter by asset type */
  filterType?: 'paper' | 'note' | 'all';
  /** Title */
  title?: string;
}

// ============================================================
// Component
// ============================================================

export function AssetBrowser({
  isOpen,
  onClose,
  onSelect,
  filterType = 'all',
  title = 'Open Asset',
}: AssetBrowserProps) {
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch assets
  const fetchAssets = useCallback(async (search: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterType !== 'all') params.set('type', filterType);
      params.set('limit', '20');

      const res = await fetch(`/api/v2/assets?${params}`);
      if (res.ok) {
        const json = await res.json();
        // API returns { success, data: { assets, total, ... } }
        const rawAssets = json.data?.assets || json.data || [];
        const items: AssetItem[] = (Array.isArray(rawAssets) ? rawAssets : []).map((a: Record<string, unknown>) => ({
          id: a.id as number,
          type: (a.asset_type || a.type || 'paper') as 'paper' | 'note',
          title: (a.title || 'Untitled') as string,
          description: (a.abstract || a.description || '') as string,
          createdAt: (a.created_at || a.createdAt) as string | undefined,
        }));
        setAssets(items);
        setSelectedIndex(0);
      }
    } catch {
      // Silently fail — asset list stays empty
    } finally {
      setIsLoading(false);
    }
  }, [filterType]);

  // Load on open and when query changes
  useEffect(() => {
    if (isOpen) {
      fetchAssets(query);
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, query, fetchAssets]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setAssets([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, assets.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && assets[selectedIndex]) {
      e.preventDefault();
      onSelect(assets[selectedIndex]);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [assets, selectedIndex, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal - Consistent with the project: white background, slate borders and text */}
      <div
        className="relative w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={title}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder:text-slate-400"
          />
          {isLoading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Asset List */}
        <div className="max-h-64 overflow-y-auto">
          {assets.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {isLoading ? 'Loading...' : query ? 'No assets found' : 'No assets available'}
            </div>
          ) : (
            assets.map((asset, index) => (
              <button
                key={asset.id}
                onClick={() => { onSelect(asset); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-50 text-slate-900 border-l-2 border-l-blue-500'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {asset.type === 'paper' ? (
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                ) : (
                  <StickyNote className="h-4 w-4 text-amber-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate text-slate-800">{asset.title}</div>
                  {asset.description && (
                    <div className="text-xs text-slate-500 truncate">{asset.description}</div>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0 capitalize">{asset.type}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
          <span>{assets.length} assets</span>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">↑↓</kbd>
            <span>navigate</span>
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">↵</kbd>
            <span>select</span>
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">esc</kbd>
            <span>close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
