'use client';

/**
 * WorkspaceFileBrowser
 *
 * Command-palette style modal that lists workspace files saved in the DB.
 * Groups files by prefix (LaTeX sources, compiled output, etc.) and lets
 * the user select one to restore or download.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, FileText, FileCode, FileOutput,
  X, Loader2, FolderOpen,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

export interface WorkspaceFileItem {
  id: string;
  path: string;
  hash: string;
  updatedAt: string;
}

export interface WorkspaceFileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Called when a file is selected. Content is fetched and provided. */
  onSelectFile: (file: { path: string; content: string }) => void;
  /** Optional: only show files matching this prefix */
  filterPrefix?: string;
  title?: string;
}

// ============================================================
// Helpers
// ============================================================

function getFileCategory(path: string): string {
  if (path.startsWith('latex/')) return 'LaTeX Sources';
  if (path.startsWith('output/')) return 'Compiled Output';
  if (path.startsWith('jupyter/')) return 'Jupyter';
  if (path.startsWith('code/')) return 'Code';
  return 'Other';
}

function getFileIcon(path: string) {
  if (path.endsWith('.pdf.b64')) return <FileOutput className="h-4 w-4 text-rose-500 shrink-0" />;
  if (path.endsWith('.tex') || path.endsWith('.bib') || path.endsWith('.sty'))
    return <FileCode className="h-4 w-4 text-teal-600 shrink-0" />;
  return <FileText className="h-4 w-4 text-blue-600 shrink-0" />;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Component
// ============================================================

export function WorkspaceFileBrowser({
  isOpen,
  onClose,
  workspaceId,
  onSelectFile,
  filterPrefix,
  title = 'Workspace Files',
}: WorkspaceFileBrowserProps) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch file list
  const fetchFiles = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/files`);
      if (res.ok) {
        const json = await res.json();
        const raw: WorkspaceFileItem[] = json.data?.files || [];
        setFiles(raw);
        setSelectedIndex(0);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, fetchFiles]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setFiles([]);
      setSelectedIndex(0);
      setLoadingFile(null);
    }
  }, [isOpen]);

  // Filter
  const filtered = files.filter((f) => {
    if (filterPrefix && !f.path.startsWith(filterPrefix)) return false;
    if (query && !f.path.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, WorkspaceFileItem[]>>((acc, f) => {
    const cat = getFileCategory(f.path);
    (acc[cat] ??= []).push(f);
    return acc;
  }, {});

  // Flat list for keyboard nav
  const flatList = Object.values(grouped).flat();

  // Select file — fetch content and call callback
  const handleSelect = useCallback(async (file: WorkspaceFileItem) => {
    setLoadingFile(file.path);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/files/${file.path}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.content != null) {
          onSelectFile({ path: file.path, content: json.data.content });
          onClose();
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingFile(null);
    }
  }, [workspaceId, onSelectFile, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatList[selectedIndex]) {
      e.preventDefault();
      handleSelect(flatList[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [flatList, selectedIndex, handleSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
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
            placeholder={`Search ${title.toLowerCase()}...`}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            className="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder:text-slate-400"
          />
          {isLoading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* File List */}
        <div className="max-h-72 overflow-y-auto">
          {flatList.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {isLoading ? 'Loading...' : query ? 'No files found' : 'No saved files yet'}
            </div>
          ) : (
            Object.entries(grouped).map(([category, categoryFiles]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide bg-slate-50/80 sticky top-0">
                  <FolderOpen className="h-3 w-3 inline-block mr-1" />
                  {category}
                </div>
                {categoryFiles.map((file) => {
                  const flatIndex = flatList.indexOf(file);
                  const isSelected = flatIndex === selectedIndex;
                  return (
                    <button
                      key={file.id}
                      onClick={() => handleSelect(file)}
                      disabled={!!loadingFile}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-slate-900 border-l-2 border-l-blue-500'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {loadingFile === file.path ? (
                        <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />
                      ) : (
                        getFileIcon(file.path)
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-slate-800">
                          {file.path}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        {formatDate(file.updatedAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
          <span>{flatList.length} file{flatList.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">↑↓</kbd>
            <span>navigate</span>
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">↵</kbd>
            <span>open</span>
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">esc</kbd>
            <span>close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
