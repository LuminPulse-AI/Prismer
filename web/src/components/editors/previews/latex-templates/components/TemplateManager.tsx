"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  X,
  RefreshCw,
  Loader2,
  LayoutGrid,
  List,
  Upload,
} from "lucide-react";
import { GithubIcon as Github } from "./icons";
import { TemplateCard } from "./TemplateCard";
import { TemplateSearch } from "./TemplateSearch";
import { TemplateFilters } from "./TemplateFilters";
import { TemplatePreview } from "./TemplatePreview";
import { GitHubImporter } from "./GitHubImporter";
import { templateService } from "../services/TemplateService";
import type {
  TemplateMetadata,
  TemplateFiles,
  TemplateCategory,
  CategoryInfo,
} from "../types";

// ============================================================
// Props
// ============================================================

interface TemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (files: TemplateFiles) => void;
}

// ============================================================
// Component
// ============================================================

export function TemplateManager({
  isOpen,
  onClose,
  onImport,
}: TemplateManagerProps) {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateMetadata | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showGitHubImporter, setShowGitHubImporter] = useState(false);

  // Get categories with counts
  const categories = useMemo<CategoryInfo[]>(() => {
    return templateService.getCategories();
  }, []);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templateService.searchTemplates({
      query: searchQuery,
      category: selectedCategory || undefined,
    });
  }, [searchQuery, selectedCategory]);

  // Handle template selection
  const handleSelectTemplate = useCallback((template: TemplateMetadata) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  }, []);

  // Handle template import
  const handleImportTemplate = useCallback(
    async (template: TemplateMetadata): Promise<TemplateFiles | null> => {
      setIsLoading(true);
      try {
        const result = await templateService.downloadTemplate(template.id);
        if (result.success && result.data) {
          return result.data;
        }
        throw new Error(result.error || "Failed to download template");
      } catch (error) {
        console.error("Import error:", error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Handle direct import (from card button)
  const handleDirectImport = useCallback(
    async (template: TemplateMetadata) => {
      const files = await handleImportTemplate(template);
      if (files) {
        onImport(files);
        onClose();
      }
    },
    [handleImportTemplate, onImport, onClose]
  );

  // Handle GitHub URL import
  const handleGitHubImport = useCallback(
    async (url: string) => {
      setIsLoading(true);
      try {
        const result = await templateService.importFromGitHub(url);
        if (result.success && result.data?.files) {
          onImport(result.data.files);
          onClose();
        } else {
          throw new Error(result.error || "Failed to import from GitHub");
        }
      } catch (error) {
        console.error("GitHub import error:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onImport, onClose]
  );

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // For now, just show a message - full implementation would use JSZip
      alert("ZIP file upload coming soon. Please use GitHub import for now.");
    },
    []
  );

  // Keyboard shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !showPreview && !showGitHubImporter) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showPreview, showGitHubImporter, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-slate-900 rounded-xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Template Gallery
            </h2>
            <p className="text-xs text-slate-400">
              Choose from {filteredTemplates.length} templates or import from GitHub
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* GitHub Import Button */}
            <button
              onClick={() => setShowGitHubImporter(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <Github className="h-4 w-4" />
              Import URL
            </button>

            {/* File Upload */}
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer">
              <Upload className="h-4 w-4" />
              Upload ZIP
              <input
                type="file"
                accept=".zip"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-700/50">
          {/* Search */}
          <TemplateSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search templates by name, tag, or author..."
            isLoading={isLoading}
          />

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-violet-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-violet-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="px-6 py-3 border-b border-slate-700/50">
          <TemplateFilters
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>

        {/* Template Grid/List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
            </div>
          )}

          {!isLoading && filteredTemplates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-4">📭</div>
              <h3 className="text-lg font-medium text-white mb-2">
                No templates found
              </h3>
              <p className="text-sm text-slate-400 max-w-md">
                Try adjusting your search query or filters, or import a template
                directly from GitHub.
              </p>
            </div>
          )}

          {!isLoading && filteredTemplates.length > 0 && (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  : "space-y-2"
              }
            >
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={handleSelectTemplate}
                  onImport={handleDirectImport}
                  isSelected={selectedTemplate?.id === template.id}
                  compact={viewMode === "list"}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
              {selectedCategory && ` in ${selectedCategory}`}
            </span>
            <span>
              Press <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Esc</kbd> to close
            </span>
          </div>
        </div>
      </div>

      {/* Template Preview Modal */}
      {selectedTemplate && (
        <TemplatePreview
          template={selectedTemplate}
          isOpen={showPreview}
          onClose={() => {
            setShowPreview(false);
            setSelectedTemplate(null);
          }}
          onImport={async (template) => {
            const files = await handleImportTemplate(template);
            if (files) {
              onImport(files);
              onClose();
            }
            return files;
          }}
        />
      )}

      {/* GitHub Importer Modal */}
      <GitHubImporter
        isOpen={showGitHubImporter}
        onClose={() => setShowGitHubImporter(false)}
        onImport={handleGitHubImport}
      />
    </div>
  );
}
