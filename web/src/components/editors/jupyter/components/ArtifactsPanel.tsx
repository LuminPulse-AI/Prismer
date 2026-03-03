'use client';

/**
 * ArtifactsPanel - Artifact Management Panel (Refactored)
 *
 * Features:
 * - Real-time display of execution artifacts (auto-subscribes to ArtifactStore)
 * - Grouped by type (images, DataFrames, charts)
 * - Thumbnail previews
 * - Click to enlarge
 * - Export and download
 */

import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  Image as ImageIcon,
  Table2,
  BarChart3,
  File,
  Download,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Archive,
  Eye,
  X,
  RefreshCw,
  Loader2,
  Send,
} from 'lucide-react';
import {
  useArtifactStore,
  useArtifacts,
  useArtifactCount,
  type DetectedArtifact,
  type ArtifactType
} from '../store/artifactStore';
import { useArtifactCollector } from '../hooks/useArtifactCollector';
import { componentEventBus } from '@/lib/events';

// ============================================================
// Type Definitions
// ============================================================

interface ArtifactsPanelProps {
  onGoToCell?: (cellId: string) => void;
  className?: string;
}

// ============================================================
// ArtifactsPanel Component
// ============================================================

export const ArtifactsPanel = memo(function ArtifactsPanel({
  onGoToCell,
  className = '',
}: ArtifactsPanelProps) {
  // Use ArtifactStore
  const artifacts = useArtifacts();
  const artifactCount = useArtifactCount();
  const clearAll = useArtifactStore((state) => state.clearAll);
  const removeArtifact = useArtifactStore((state) => state.removeArtifact);
  
  // Enable Artifact collector
  const { scanAllCells } = useArtifactCollector({ enabled: true });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['image', 'dataframe', 'chart'])
  );
  const [previewArtifact, setPreviewArtifact] = useState<DetectedArtifact | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Group by type
  const groupedArtifacts = useMemo(() => {
    const groups: Record<string, DetectedArtifact[]> = {
      image: [],
      dataframe: [],
      chart: [],
      file: [],
      other: [],
    };

    artifacts.forEach(artifact => {
      const type = artifact.type;
      if (groups[type]) {
        groups[type].push(artifact);
      } else {
        groups.other.push(artifact);
      }
    });

    return groups;
  }, [artifacts]);

  // Toggle group expand/collapse
  const toggleGroup = useCallback((type: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Manual scan
  const handleScan = useCallback(async () => {
    setIsScanning(true);
    await new Promise(resolve => setTimeout(resolve, 100)); // UI update
    scanAllCells();
    setIsScanning(false);
  }, [scanAllCells]);

  // Get icon
  const getGroupIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={14} className="text-pink-400" />;
      case 'dataframe':
        return <Table2 size={14} className="text-green-400" />;
      case 'chart':
        return <BarChart3 size={14} className="text-blue-400" />;
      case 'file':
        return <File size={14} className="text-orange-400" />;
      default:
        return <File size={14} className="text-slate-400" />;
    }
  };

  // Get label
  const getGroupLabel = (type: string) => {
    switch (type) {
      case 'image':
        return 'Images';
      case 'dataframe':
        return 'DataFrames';
      case 'chart':
        return 'Charts';
      case 'file':
        return 'Files';
      default:
        return 'Other';
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Archive size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-800">Artifacts</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            artifactCount > 0 ? 'bg-blue-100 text-blue-700' : 'text-slate-500'
          }`}>
            {artifactCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 disabled:opacity-50"
            title="Scan all cells for artifacts"
          >
            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
          </button>
          {artifactCount > 0 && (
            <button
              onClick={() => {
                if (confirm('Clear all artifacts?')) {
                  clearAll();
                }
              }}
              className="p-1 hover:bg-red-50 rounded text-slate-500 hover:text-red-600"
              title="Clear all"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {artifactCount === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm space-y-2">
            <Archive size={32} className="mx-auto text-slate-400" />
            <p>No artifacts yet</p>
            <p className="text-xs">Execute cells to generate outputs</p>
            <button
              onClick={handleScan}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700"
            >
              Scan existing outputs
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {Object.entries(groupedArtifacts).map(([type, items]) => {
              if (items.length === 0) return null;
              
              return (
                <ArtifactGroup
                  key={type}
                  type={type}
                  artifacts={items}
                  icon={getGroupIcon(type)}
                  label={getGroupLabel(type)}
                  isExpanded={expandedGroups.has(type)}
                  onToggle={() => toggleGroup(type)}
                  onArtifactClick={setPreviewArtifact}
                  onDelete={removeArtifact}
                  onGoToCell={onGoToCell}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewArtifact && (
        <ArtifactPreview
          artifact={previewArtifact}
          onClose={() => setPreviewArtifact(null)}
          onGoToCell={onGoToCell}
        />
      )}
    </div>
  );
});

// ============================================================
// ArtifactGroup Component
// ============================================================

interface ArtifactGroupProps {
  type: string;
  artifacts: DetectedArtifact[];
  icon: React.ReactNode;
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  onArtifactClick: (artifact: DetectedArtifact) => void;
  onDelete: (id: string) => void;
  onGoToCell?: (cellId: string) => void;
}

const ArtifactGroup = memo(function ArtifactGroup({
  type,
  artifacts,
  icon,
  label,
  isExpanded,
  onToggle,
  onArtifactClick,
  onDelete,
  onGoToCell,
}: ArtifactGroupProps) {
  return (
    <div>
      {/* Group Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={12} className="text-slate-500" />
        ) : (
          <ChevronRight size={12} className="text-slate-500" />
        )}
        {icon}
        <span className="text-sm text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">({artifacts.length})</span>
      </button>

      {/* Items */}
      {isExpanded && (
        <div className="px-3 pb-2">
          {type === 'image' ? (
            // Image thumbnail grid
            <div className="grid grid-cols-3 gap-2">
              {artifacts.map((artifact) => (
                <ImageThumbnail
                  key={artifact.id}
                  artifact={artifact}
                  onClick={() => onArtifactClick(artifact)}
                />
              ))}
            </div>
          ) : (
            // List view
            <div className="space-y-1">
              {artifacts.map((artifact) => (
                <ArtifactItem
                  key={artifact.id}
                  artifact={artifact}
                  onClick={() => onArtifactClick(artifact)}
                  onDelete={() => onDelete(artifact.id)}
                  onGoToCell={() => onGoToCell?.(artifact.cellId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================================
// ImageThumbnail Component
// ============================================================

interface ImageThumbnailProps {
  artifact: DetectedArtifact;
  onClick: () => void;
}

const ImageThumbnail = memo(function ImageThumbnail({
  artifact,
  onClick,
}: ImageThumbnailProps) {
  const src = artifact.thumbnail || 
    (typeof artifact.data === 'string' ? artifact.data : '');

  return (
    <button
      onClick={onClick}
      className="aspect-square bg-slate-100 border border-slate-200 rounded overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all group relative"
    >
      {src ? (
        <img
          src={src}
          alt={artifact.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon size={24} className="text-slate-400" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Eye size={16} className="text-white" />
      </div>
    </button>
  );
});

// ============================================================
// ArtifactItem Component
// ============================================================

interface ArtifactItemProps {
  artifact: DetectedArtifact;
  onClick: () => void;
  onDelete: () => void;
  onGoToCell?: () => void;
}

const ArtifactItem = memo(function ArtifactItem({
  artifact,
  onClick,
  onDelete,
  onGoToCell,
}: ArtifactItemProps) {
  const getIcon = () => {
    switch (artifact.type) {
      case 'dataframe':
        return <Table2 size={12} className="text-green-600" />;
      case 'chart':
        return <BarChart3 size={12} className="text-blue-600" />;
      default:
        return <File size={12} className="text-slate-500" />;
    }
  };

  const getMetaInfo = () => {
    if (artifact.type === 'dataframe' && artifact.metadata) {
      const { rows, columns } = artifact.metadata;
      if (rows !== undefined && columns !== undefined) {
        return `${rows} × ${columns}`;
      }
    }
    if (artifact.size) {
      return formatBytes(artifact.size);
    }
    return null;
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded hover:bg-slate-100 border border-transparent hover:border-slate-200 group">
      {getIcon()}
      <button
        onClick={onClick}
        className="flex-1 text-left text-sm text-slate-700 truncate hover:text-slate-900"
      >
        {artifact.name}
      </button>
      {getMetaInfo() && (
        <span className="text-xs text-slate-500">{getMetaInfo()}</span>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onGoToCell && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGoToCell();
            }}
            className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800"
            title="Go to cell"
          >
            <ExternalLink size={10} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 hover:bg-red-50 rounded text-slate-500 hover:text-red-600"
          title="Remove"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
});

// ============================================================
// ArtifactPreview Component
// ============================================================

interface ArtifactPreviewProps {
  artifact: DetectedArtifact;
  onClose: () => void;
  onGoToCell?: (cellId: string) => void;
}

const ArtifactPreview = memo(function ArtifactPreview({
  artifact,
  onClose,
  onGoToCell,
}: ArtifactPreviewProps) {
  // Download functionality
  const handleDownload = useCallback(() => {
    let blob: Blob;
    let filename: string;

    if (artifact.type === 'image' && typeof artifact.data === 'string') {
      // Extract data from data URL
      const [header, base64] = artifact.data.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: mimeType });
      filename = `${artifact.name}.${mimeType.split('/')[1]}`;
    } else if (typeof artifact.data === 'string') {
      blob = new Blob([artifact.data], { type: 'text/html' });
      filename = `${artifact.name}.html`;
    } else {
      blob = new Blob([JSON.stringify(artifact.data, null, 2)], { type: 'application/json' });
      filename = `${artifact.name}.json`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [artifact]);

  const renderContent = () => {
    if (artifact.type === 'image') {
      const src = typeof artifact.data === 'string' ? artifact.data : '';
      return (
        <img
          src={src}
          alt={artifact.name}
          className="max-w-full max-h-[70vh] object-contain"
        />
      );
    }

    if (artifact.type === 'dataframe') {
      return (
        <div className="text-slate-700 text-sm w-full">
          <div className="mb-2 flex items-center gap-4">
            <span className="text-slate-500">Shape: </span>
            <span>{artifact.metadata.rows} × {artifact.metadata.columns}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded overflow-auto max-h-[60vh]">
            {typeof artifact.data === 'string' ? (
              <div 
                className="p-4 [&_table]:w-full [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_tr]:border-b [&_tr]:border-slate-200"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(artifact.data) }}
              />
            ) : (
              <pre className="p-4 font-mono text-xs text-slate-800">{JSON.stringify(artifact.data, null, 2)}</pre>
            )}
          </div>
        </div>
      );
    }

    if (artifact.type === 'chart') {
      return (
        <div className="text-slate-700 text-sm">
          <p className="mb-2">Plotly Chart</p>
          <pre className="bg-slate-50 border border-slate-200 rounded p-4 overflow-auto max-h-[60vh] font-mono text-xs text-slate-800">
            {JSON.stringify(artifact.data, null, 2)}
          </pre>
        </div>
      );
    }

    return (
      <pre className="text-slate-700 text-sm font-mono overflow-auto max-h-[60vh]">
        {typeof artifact.data === 'string' ? artifact.data : JSON.stringify(artifact.data, null, 2)}
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-slate-500" />
            <span className="text-slate-900 font-medium">{artifact.name}</span>
            <span className="text-xs text-slate-500">
              {artifact.metadata.format || artifact.mimeType}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Build HTML content from artifact
                let html = '';
                if (artifact.type === 'image' && typeof artifact.data === 'string') {
                  html = `<h3>${artifact.name}</h3><img src="${artifact.data}" alt="${artifact.name}" style="max-width: 100%;" />`;
                } else if (artifact.type === 'dataframe' && typeof artifact.data === 'string') {
                  html = `<h3>${artifact.name}</h3>${artifact.data}`;
                } else {
                  const text = typeof artifact.data === 'string' ? artifact.data : JSON.stringify(artifact.data, null, 2);
                  html = `<h3>${artifact.name}</h3><pre>${text}</pre>`;
                }
                componentEventBus.emit({
                  component: 'ai-editor',
                  type: 'notesInsert',
                  payload: { result: html, message: 'jupyter-artifact' },
                  timestamp: Date.now(),
                });
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-600 hover:text-cyan-700 hover:bg-slate-100 rounded"
              title="Send to Workspace Notes"
            >
              <Send size={12} />
              To Notes
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded"
            >
              <Download size={12} />
              Download
            </button>
            {onGoToCell && (
              <button
                onClick={() => {
                  onGoToCell(artifact.cellId);
                  onClose();
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded"
              >
                <ExternalLink size={12} />
                Go to Cell
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50/50">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
          <span>Cell: {artifact.cellId.slice(0, 8)}...</span>
          <span>Size: {formatBytes(artifact.size)}</span>
          <span>Created: {new Date(artifact.createdAt).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
});

// ============================================================
// Utility Functions
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default ArtifactsPanel;
