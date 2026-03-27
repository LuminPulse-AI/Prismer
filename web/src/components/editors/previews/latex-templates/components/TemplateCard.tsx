"use client";

import { memo } from "react";
import { Star, Download, ExternalLink, FileText } from "lucide-react";
import { GithubIcon as Github } from "./icons";
import type { TemplateMetadata, TemplateCategory } from "../types";

// ============================================================
// Category Colors
// ============================================================

const categoryColors: Record<TemplateCategory, { bg: string; text: string; border: string }> = {
  conference: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  journal: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  thesis: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  cv: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  presentation: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/30" },
  report: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
  book: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
  letter: { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/30" },
  poster: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30" },
  other: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
};

const categoryLabels: Record<TemplateCategory, string> = {
  conference: "Conference",
  journal: "Journal",
  thesis: "Thesis",
  cv: "CV",
  presentation: "Slides",
  report: "Report",
  book: "Book",
  letter: "Letter",
  poster: "Poster",
  other: "Other",
};

// ============================================================
// Props
// ============================================================

interface TemplateCardProps {
  template: TemplateMetadata;
  onSelect?: (template: TemplateMetadata) => void;
  onImport?: (template: TemplateMetadata) => void;
  isSelected?: boolean;
  compact?: boolean;
}

// ============================================================
// Component
// ============================================================

function TemplateCardComponent({
  template,
  onSelect,
  onImport,
  isSelected = false,
  compact = false,
}: TemplateCardProps) {
  const colors = categoryColors[template.category];
  
  const handleClick = () => {
    onSelect?.(template);
  };

  const handleImport = (e: React.MouseEvent) => {
    e.stopPropagation();
    onImport?.(template);
  };

  const handleOpenGitHub = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (template.source.github) {
      const url = `https://github.com/${template.source.github.owner}/${template.source.github.repo}`;
      window.open(url, "_blank");
    }
  };

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className={`
          group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
          ${isSelected 
            ? "bg-violet-500/20 border-violet-500/50" 
            : "bg-slate-800/50 hover:bg-slate-800 border-slate-700/50"
          }
          border
        `}
      >
        <div className={`p-2 rounded-lg ${colors.bg}`}>
          <FileText className={`h-4 w-4 ${colors.text}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">
            {template.name}
          </h4>
          <p className="text-xs text-slate-400 truncate">
            {template.author || "Unknown"}
          </p>
        </div>

        {template.stars && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Star className="h-3 w-3" />
            {template.stars >= 1000 
              ? `${(template.stars / 1000).toFixed(1)}k` 
              : template.stars
            }
          </div>
        )}

        <button
          onClick={handleImport}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-all"
          title="Import template"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`
        group relative flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all
        ${isSelected 
          ? "ring-2 ring-violet-500 bg-slate-800" 
          : "bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600"
        }
      `}
    >
      {/* Preview Area */}
      <div className={`relative h-32 ${colors.bg} flex items-center justify-center`}>
        <FileText className={`h-12 w-12 ${colors.text} opacity-50`} />
        
        {/* Category Badge */}
        <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
          {categoryLabels[template.category]}
        </div>

        {/* Source Badge */}
        {template.source.type === "github" && (
          <button
            onClick={handleOpenGitHub}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900/50 text-slate-300 hover:bg-slate-900 hover:text-white transition-colors"
            title="View on GitHub"
          >
            <Github className="h-3.5 w-3.5" />
          </button>
        )}

        {template.source.type === "overleaf" && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
            Overleaf
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <h3 className="text-sm font-semibold text-white mb-1 truncate">
          {template.name}
        </h3>
        
        <p className="text-xs text-slate-400 line-clamp-2 mb-3 min-h-[2.5rem]">
          {template.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {template.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400"
            >
              {tag}
            </span>
          ))}
          {template.tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] text-slate-500">
              +{template.tags.length - 3}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {template.stars && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                {template.stars >= 1000 
                  ? `${(template.stars / 1000).toFixed(1)}k` 
                  : template.stars
                }
              </span>
            )}
            {template.author && (
              <span className="truncate max-w-[100px]">
                {template.author}
              </span>
            )}
          </div>

          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-violet-500 text-white hover:bg-violet-600 transition-colors"
          >
            <Download className="h-3 w-3" />
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

export const TemplateCard = memo(TemplateCardComponent);
