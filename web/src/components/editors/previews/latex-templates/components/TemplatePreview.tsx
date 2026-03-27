"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Star,
  Calendar,
  User,
  Tag,
  Loader2,
  Check,
  AlertCircle,
  File,
  FileCode,
  Package,
} from "lucide-react";
import { GithubIcon as Github } from "./icons";
import type { TemplateMetadata, TemplateFiles, TemplateFile } from "../types";

// ============================================================
// Props
// ============================================================

interface TemplatePreviewProps {
  template: TemplateMetadata;
  isOpen: boolean;
  onClose: () => void;
  onImport: (template: TemplateMetadata) => Promise<TemplateFiles | null>;
}

// ============================================================
// File Icon Helper
// ============================================================

function getFileIcon(type: TemplateFile["type"]) {
  switch (type) {
    case "tex":
      return <FileText className="h-4 w-4 text-emerald-400" />;
    case "bib":
      return <FileCode className="h-4 w-4 text-amber-400" />;
    case "sty":
    case "cls":
      return <Package className="h-4 w-4 text-violet-400" />;
    case "bst":
      return <FileCode className="h-4 w-4 text-blue-400" />;
    case "image":
      return <File className="h-4 w-4 text-pink-400" />;
    default:
      return <File className="h-4 w-4 text-slate-400" />;
  }
}

// ============================================================
// Component
// ============================================================

export function TemplatePreview({
  template,
  isOpen,
  onClose,
  onImport,
}: TemplatePreviewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<TemplateFiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // Load template files when opened
  useEffect(() => {
    if (isOpen && !files && !isLoading) {
      loadFiles();
    }
  }, [isOpen]);

  // Reset state when template changes
  useEffect(() => {
    setFiles(null);
    setError(null);
    setImportSuccess(false);
  }, [template.id]);

  const loadFiles = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await onImport(template);
      if (result) {
        setFiles(result);
      } else {
        setError("Failed to load template files");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = useCallback(async () => {
    if (!files) {
      await loadFiles();
    }
    
    setIsImporting(true);
    
    try {
      // The actual import is handled by the parent component
      // Here we just show success feedback
      await new Promise(resolve => setTimeout(resolve, 500));
      setImportSuccess(true);
      
      // Auto close after success
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }, [files, onClose]);

  const handleOpenGitHub = () => {
    if (template.source.github) {
      const url = `https://github.com/${template.source.github.owner}/${template.source.github.repo}`;
      window.open(url, "_blank");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900 rounded-xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/20">
              <FileText className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {template.name}
              </h2>
              <p className="text-xs text-slate-400">
                {template.category.charAt(0).toUpperCase() + template.category.slice(1)} Template
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Description */}
          <p className="text-sm text-slate-300 mb-4">
            {template.description}
          </p>

          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {template.author && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-slate-500" />
                <span className="text-slate-400">Author:</span>
                <span className="text-slate-200">{template.author}</span>
              </div>
            )}
            
            {template.stars && (
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-amber-500" />
                <span className="text-slate-400">Stars:</span>
                <span className="text-slate-200">
                  {template.stars.toLocaleString()}
                </span>
              </div>
            )}

            {template.lastUpdated && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span className="text-slate-400">Updated:</span>
                <span className="text-slate-200">
                  {new Date(template.lastUpdated).toLocaleDateString()}
                </span>
              </div>
            )}

            {template.license && (
              <div className="flex items-center gap-2 text-sm">
                <FileCode className="h-4 w-4 text-slate-500" />
                <span className="text-slate-400">License:</span>
                <span className="text-slate-200">{template.license}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-400">Tags</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {template.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Files Preview */}
          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <File className="h-4 w-4 text-slate-400" />
              Template Files
            </h3>

            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
                <span className="ml-2 text-sm text-slate-400">
                  Loading files...
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {files && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {files.files.map((file) => (
                  <div
                    key={file.path}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                      ${file.name === files.mainFile
                        ? "bg-violet-500/10 border border-violet-500/30"
                        : "bg-slate-800/50"
                      }
                    `}
                  >
                    {getFileIcon(file.type)}
                    <span className="flex-1 text-slate-300 truncate">
                      {file.path}
                    </span>
                    {file.name === files.mainFile && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-violet-500/20 text-violet-400">
                        main
                      </span>
                    )}
                    {file.size && (
                      <span className="text-xs text-slate-500">
                        {file.size < 1024
                          ? `${file.size} B`
                          : `${(file.size / 1024).toFixed(1)} KB`
                        }
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isLoading && !error && !files && (
              <button
                onClick={loadFiles}
                className="w-full py-3 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
              >
                Click to preview files
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          {/* Source Link */}
          <div className="flex items-center gap-2">
            {template.source.type === "github" && (
              <button
                onClick={handleOpenGitHub}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <Github className="h-4 w-4" />
                View on GitHub
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Import Button */}
          <button
            onClick={handleImport}
            disabled={isImporting || importSuccess}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${importSuccess
                ? "bg-emerald-500 text-white"
                : "bg-violet-500 text-white hover:bg-violet-600"
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : importSuccess ? (
              <>
                <Check className="h-4 w-4" />
                Imported!
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Import Template
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
