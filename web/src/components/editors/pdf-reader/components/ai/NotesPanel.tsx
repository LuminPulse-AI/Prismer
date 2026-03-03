/**
 * Notes Panel
 * 
 * Notes panel integrated with AiEditor
 *
 * Updates:
 * - Integrated NotebookStore for notebook persistence
 * - Added NotebookSelector for notebook switching
 * - Support for import queue viewing and management
 * - Support for cross-paper citation display
 */

"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Inbox, ChevronRight, Trash2, FileText } from 'lucide-react';
import { Extract } from '@/types/paperContext';
import { useAIStore } from '../../store/aiStore';
import {
  useNotebookStore,
  useActiveNotebook,
  useNotebookEntries,
  useImportQueue,
  NoteEntry,
  NoteEntryType,
} from '../../store/notebookStore';
import { NotebookSelector } from '../ui/NotebookSelector';
import { UnifiedCitationTag } from '../ui/UnifiedCitationTag';
import { createCitation, Citation } from '../../types/citation';
import { Button } from '@/components/ui/button';

// ============================================================
// Types
// ============================================================

interface NotesPanelProps {
  extracts: Extract[];
  className?: string;
}

// ============================================================
// Sub-Components
// ============================================================

interface ImportQueueItemProps {
  item: {
    id: string;
    type: NoteEntryType;
    content: string;
    source?: Citation;
    timestamp: number;
  };
  onImport: (id: string) => void;
  onRemove: (id: string) => void;
}

const ImportQueueItem: React.FC<ImportQueueItemProps> = ({
  item,
  onImport,
  onRemove,
}) => {
  const preview = item.content.slice(0, 100).replace(/<[^>]*>/g, '');
  
  return (
    <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
      <FileText className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-amber-700 font-medium mb-1 capitalize">
          {item.type.replace('_', ' ')}
        </div>
        <p className="text-xs text-stone-600 line-clamp-2">{preview}</p>
        {item.source && (
          <div className="mt-1">
            <UnifiedCitationTag citation={item.source} size="sm" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => onImport(item.id)}
          className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
        >
          Add
        </button>
        <button
          onClick={() => onRemove(item.id)}
          className="p-1 text-stone-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// ============================================================
// Component
// ============================================================

export const NotesPanel: React.FC<NotesPanelProps> = ({
  extracts,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImportQueue, setShowImportQueue] = useState(false);
  
  // AI Store - for extracts from PDF selection
  const { removeExtract, paperContext } = useAIStore();
  
  // Notebook Store
  const {
    addEntry,
    addToImportQueue,
    importFromQueue,
    removeFromImportQueue,
    importAllFromQueue,
    createOrGetDefaultNotebook,
  } = useNotebookStore();
  
  const activeNotebook = useActiveNotebook();
  const entries = useNotebookEntries();
  const importQueue = useImportQueue();
  
  // Current paper info
  const currentPaperId = paperContext?.source?.arxivId || null;
  
  // Track processed extract IDs to avoid duplicate insertions
  const processedExtractIds = useRef<Set<string>>(new Set());
  
  // Track the last loaded notebook ID to detect switches
  const lastLoadedNotebookId = useRef<string | null>(null);

  // Ensure we have a notebook
  useEffect(() => {
    if (!activeNotebook) {
      createOrGetDefaultNotebook();
    }
  }, [activeNotebook, createOrGetDefaultNotebook]);
  
  // Sync editor content with notebook when notebook changes
  useEffect(() => {
    if (!isLoaded || !editorRef.current || !activeNotebook) return;
    
    // Skip if same notebook
    if (lastLoadedNotebookId.current === activeNotebook.id) return;
    
    // Update last loaded notebook ID
    lastLoadedNotebookId.current = activeNotebook.id;
    
    // Clear the editor and load entries from the notebook
    try {
      // Helper to parse markdown image: ![alt](url)
      const parseMarkdownImg = (content: string): { alt: string; src: string } | null => {
        const match = content.match(/!\[(.*?)\]\((.*?)\)/);
        return match ? { alt: match[1] || 'Figure', src: match[2] } : null;
      };
      
      // Build HTML from all entries
      const entriesHtml = entries.map(entry => {
        const pageRef = entry.source?.pageNumber ? ` <sup>[Page ${entry.source.pageNumber}]</sup>` : '';
        switch (entry.type) {
          case 'highlight':
            return `<blockquote>${entry.rawContent}${pageRef}</blockquote>`;
          case 'figure': {
            // Parse markdown image format: ![alt](url)
            const imgData = parseMarkdownImg(entry.rawContent);
            if (imgData) {
              return `<figure><img src="${imgData.src}" alt="${imgData.alt}" style="max-width:100%" /><figcaption>${imgData.alt}${pageRef}</figcaption></figure>`;
            }
            // Fallback: rawContent might be a direct URL
            return `<figure><img src="${entry.rawContent}" alt="Figure" style="max-width:100%" />${pageRef}</figure>`;
          }
          case 'table':
            return `<div class="table-wrapper">${entry.rawContent}${pageRef}</div>`;
          case 'equation':
            return `<p><code class="math">${entry.rawContent}</code>${pageRef}</p>`;
          case 'insight':
            return `<div class="ai-insight"><p><em>AI Insight:</em> ${entry.rawContent}${pageRef}</p></div>`;
          default:
            return `<p>${entry.rawContent}${pageRef}</p>`;
        }
      }).join('<hr/>');
      
      // Set editor content (clear and replace)
      editorRef.current.setContent(entriesHtml || '');
      
      console.log('[NotesPanel] Loaded notebook content:', activeNotebook.id, 'with', entries.length, 'entries');
    } catch (error) {
      console.error('[NotesPanel] Failed to load notebook content:', error);
    }
  }, [activeNotebook?.id, entries, isLoaded]);

  // Initialize AiEditor
  useEffect(() => {
    let mounted = true;

    const initEditor = async () => {
      if (!containerRef.current || editorRef.current) return;

      try {
        // Dynamic import for AiEditor
        const { AiEditor } = await import("aieditor");
        // Import styles - ignore type error as this is a CSS file
        // @ts-ignore
        await import("aieditor/dist/style.css");

        if (!mounted || !containerRef.current) return;

        // Dynamically import AI configuration
        const { getAiEditorConfig } = await import("@/lib/aieditor-config");
        const aiConfig = getAiEditorConfig();
        
        // Initialize AiEditor with English language and custom toolbar
        editorRef.current = new AiEditor({
          element: containerRef.current,
          placeholder: "Start taking notes... Add content from PDF or Chat.",
          content: "",
          lang: "en", // English language
          toolbarKeys: [
            "undo", "redo", "|",
            "heading", "bold", "italic", "underline", "strike", "|",
            "highlight", "font-color", "|",
            "bulletedList", "numberedList", "todoList", "|",
            "quote", "code", "codeBlock", "|",
            "link", "image", "table", "|",
            "hr", "clear-format", "|",
            "ai" // Add AI button to the toolbar
          ],
          image: {
            allowBase64: true,
            defaultSize: 350,
          },
          link: {
            autolink: true,
          },
          // Merge AI configuration
          ...aiConfig,
        });

        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load AiEditor:", err);
        setError("Failed to load AiEditor. Please check console for details.");
      }
    };

    initEditor();

    return () => {
      mounted = false;
      if (editorRef.current) {
        editorRef.current.destroy?.();
        editorRef.current = null;
      }
    };
  }, []);

  // Insert content into editor
  const insertContent = useCallback((html: string) => {
    if (!editorRef.current) return;
    
    try {
      editorRef.current.insert(html);
    } catch (error) {
      console.error("Failed to insert content:", error);
    }
  }, []);

  // Parse markdown image format: ![alt](src)
  const parseMarkdownImage = (content: string): { src: string; alt: string } | null => {
    const match = content.match(/!\[(.*?)\]\((.*?)\)/);
    if (match) {
      return { alt: match[1], src: match[2] };
    }
    return null;
  };

  // Map extract type to NoteEntryType
  const mapExtractType = (type: Extract['type']): NoteEntryType => {
    switch (type) {
      case 'highlight': return 'highlight';
      case 'figure': return 'figure';
      case 'table': return 'table';
      case 'equation': return 'equation';
      case 'ai_insight': return 'insight';
      default: return 'text';
    }
  };

  // Convert extract to HTML
  const convertExtractToHtml = useCallback((extract: Extract): string => {
    const pageRef = extract.source.pageNumber ? ` <sup>[Page ${extract.source.pageNumber}]</sup>` : '';

    switch (extract.type) {
      case 'highlight':
        return `<blockquote>${extract.content}${pageRef}</blockquote>`;
      case 'figure':
        const imgData = parseMarkdownImage(extract.content);
        if (imgData) {
          return `<figure><img src="${imgData.src}" alt="${imgData.alt}" style="max-width:100%" /><figcaption>${imgData.alt || 'Figure'}${pageRef}</figcaption></figure>`;
        }
        return `<figure><img src="${extract.content}" alt="Figure from PDF" style="max-width:100%" /><figcaption>Figure${pageRef}</figcaption></figure>`;
      case 'table':
        return `<div class="table-wrapper">${extract.content}${pageRef}</div>`;
      case 'equation':
        return `<p><code class="math">${extract.content}</code>${pageRef}</p>`;
      case 'ai_insight':
        return `<div class="ai-insight"><p><em>AI Insight:</em> ${extract.content}${pageRef}</p></div>`;
      default:
        return `<p>${extract.content}${pageRef}</p>`;
    }
  }, []);

  // Create source citation from extract
  const createSourceFromExtract = useCallback((extract: Extract): Citation | undefined => {
    if (!currentPaperId) return undefined;
    
    const detectionId = extract.source.detection_id || `p${extract.source.pageNumber || 1}_text_0`;
    
    return createCitation(currentPaperId, detectionId, {
      pageNumber: extract.source.pageNumber || 1,
      paperTitle: paperContext?.metadata?.title,
      excerpt: extract.content.slice(0, 50),
    });
  }, [currentPaperId, paperContext]);

  // Auto-process new extracts: add to import queue or insert directly
  useEffect(() => {
    if (!isLoaded) return;

    // Find new extracts that haven't been processed
    const newExtracts = extracts.filter(e => !processedExtractIds.current.has(e.id));
    
    for (const extract of newExtracts) {
      // Mark as processed
      processedExtractIds.current.add(extract.id);
      
      // Create source citation
      const source = createSourceFromExtract(extract);
      
      // Add to import queue for review
      addToImportQueue({
        type: mapExtractType(extract.type),
        content: extract.content,
        source,
      });
      
      // Remove from old store after adding to queue
      setTimeout(() => {
        removeExtract(extract.id);
      }, 100);
    }
    
    // Show import queue if there are new items
    if (newExtracts.length > 0) {
      setShowImportQueue(true);
    }
  }, [extracts, isLoaded, createSourceFromExtract, addToImportQueue, removeExtract]);

  // Handle import from queue
  const handleImport = useCallback((id: string) => {
    const item = importQueue.find(i => i.id === id);
    if (!item) return;
    
    // Add to notebook
    addEntry({
      type: item.type,
      rawContent: item.content,
      source: item.source,
    });
    
    // Convert to HTML and insert into editor
    const html = (() => {
      const pageRef = item.source?.pageNumber ? ` <sup>[Page ${item.source.pageNumber}]</sup>` : '';
      switch (item.type) {
        case 'highlight':
          return `<blockquote>${item.content}${pageRef}</blockquote>`;
        case 'figure':
          const imgData = parseMarkdownImage(item.content);
          if (imgData) {
            return `<figure><img src="${imgData.src}" alt="${imgData.alt}" style="max-width:100%" /><figcaption>${imgData.alt || 'Figure'}${pageRef}</figcaption></figure>`;
          }
          return `<p>${item.content}${pageRef}</p>`;
        case 'table':
          return `<div class="table-wrapper">${item.content}${pageRef}</div>`;
        case 'equation':
          return `<p><code class="math">${item.content}</code>${pageRef}</p>`;
        case 'insight':
          return `<div class="ai-insight"><p><em>AI Insight:</em> ${item.content}${pageRef}</p></div>`;
        default:
          return `<p>${item.content}${pageRef}</p>`;
      }
    })();
    
    insertContent(html);
    removeFromImportQueue(id);
  }, [importQueue, addEntry, insertContent, removeFromImportQueue]);

  // Handle import all
  const handleImportAll = useCallback(() => {
    for (const item of importQueue) {
      handleImport(item.id);
    }
  }, [importQueue, handleImport]);

  if (error) {
    return (
      <div className={cn("flex h-full items-center justify-center p-4", className)}>
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Notebook Selector Header */}
      <div className="px-4 py-2 border-b border-stone-200 bg-stone-50">
        <NotebookSelector compact />
      </div>
      
      {/* Import Queue Section */}
      {importQueue.length > 0 && (
        <div className="border-b border-stone-200">
          <button
            className={cn(
              "flex items-center justify-between w-full px-4 py-2",
              "bg-amber-50 hover:bg-amber-100 transition-colors"
            )}
            onClick={() => setShowImportQueue(!showImportQueue)}
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                Import Queue ({importQueue.length})
              </span>
            </div>
            <ChevronRight className={cn(
              "w-4 h-4 text-amber-600 transition-transform",
              showImportQueue && "rotate-90"
            )} />
          </button>
          
          {showImportQueue && (
            <div className="p-2 space-y-2 bg-amber-50/50 max-h-48 overflow-y-auto">
              {importQueue.map(item => (
                <ImportQueueItem
                  key={item.id}
                  item={item}
                  onImport={handleImport}
                  onRemove={removeFromImportQueue}
                />
              ))}
              {importQueue.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-amber-700 border-amber-300 hover:bg-amber-100"
                  onClick={handleImportAll}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Import All ({importQueue.length})
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor Section - Full height */}
      <div className="flex-1 min-h-0">
        {!isLoaded && (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-stone-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading Editor...</span>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className="notes-editor-container h-full"
          style={{
            display: isLoaded ? "block" : "none",
          }}
        />
      </div>
      
      {/* Notebook Info Footer */}
      {activeNotebook && (
        <div className="px-4 py-2 border-t border-stone-200 bg-stone-50">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>
              {entries.length} note{entries.length !== 1 ? 's' : ''} • 
              {activeNotebook.paperIds.length} paper{activeNotebook.paperIds.length !== 1 ? 's' : ''}
            </span>
            <span>
              Last saved: {new Date(activeNotebook.updatedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesPanel;
