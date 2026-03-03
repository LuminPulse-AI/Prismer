/**
 * Paper Overview Card
 * 
 * Paper overview card - understand a paper's value in 30 seconds
 */

"use client";

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Users,
  Calendar,
  Tag,
  Clock,
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { PaperMetadata } from '@/types/paperContext';

// ============================================================
// Types
// ============================================================

interface PaperOverviewCardProps {
  metadata: PaperMetadata | null;
  hasOCRData: boolean;
  onNavigateToPage?: (pageNumber: number) => void;
  className?: string;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Estimate reading time (based on page count)
 */
function estimateReadingTime(totalPages: number): string {
  // Assume an average of 2-3 minutes per page
  const minTime = totalPages * 2;
  const maxTime = totalPages * 3;
  
  if (maxTime < 60) {
    return `${minTime}-${maxTime} min`;
  }
  
  const minHours = Math.floor(minTime / 60);
  const maxHours = Math.ceil(maxTime / 60);
  
  if (minHours === maxHours) {
    return `~${minHours} hr`;
  }
  return `${minHours}-${maxHours} hrs`;
}

/**
 * Format the publication date
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Get the paper type label
 */
function getPaperTypeLabel(categories: string[]): string {
  const categoryLower = categories.map(c => c.toLowerCase()).join(' ');
  
  if (categoryLower.includes('survey') || categoryLower.includes('review')) {
    return 'Survey';
  }
  if (categoryLower.includes('benchmark') || categoryLower.includes('dataset')) {
    return 'Benchmark';
  }
  if (categoryLower.includes('application')) {
    return 'Application';
  }
  return 'Research';
}

// ============================================================
// Component
// ============================================================

export const PaperOverviewCard: React.FC<PaperOverviewCardProps> = ({
  metadata,
  hasOCRData,
  onNavigateToPage,
  className,
}) => {
  const paperType = useMemo(() => {
    return metadata?.categories ? getPaperTypeLabel(metadata.categories) : 'Paper';
  }, [metadata?.categories]);

  const readingTime = useMemo(() => {
    return metadata?.total_pages ? estimateReadingTime(metadata.total_pages) : '~15 min';
  }, [metadata?.total_pages]);

  if (!metadata) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex flex-col items-center justify-center py-8 text-stone-500">
          <FileText className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No paper loaded</p>
          <p className="text-xs mt-1">Load a PDF to see overview</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-4 space-y-4', className)}>
      {/* Title and type */}
      <div>
        <div className="flex items-start gap-2 mb-2">
          <span className={cn(
            'px-2 py-0.5 text-xs font-medium rounded-full',
            'bg-indigo-100 text-indigo-700'
          )}>
            {paperType}
          </span>
          {hasOCRData && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              OCR Ready
            </span>
          )}
        </div>
        <h2 className="text-lg font-semibold text-stone-900 leading-tight">
          {metadata.title}
        </h2>
      </div>

      {/* Authors */}
      <div className="flex items-start gap-2">
        <Users className="w-4 h-4 mt-0.5 text-stone-500 flex-shrink-0" />
        <p className="text-sm text-stone-700 leading-relaxed">
          {metadata.authors.slice(0, 5).join(', ')}
          {metadata.authors.length > 5 && ` +${metadata.authors.length - 5} more`}
        </p>
      </div>

      {/* Metadata bar */}
      <div className="flex flex-wrap gap-3 text-sm text-stone-600">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(metadata.published)}</span>
        </div>
        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4" />
          <span>{metadata.total_pages} pages</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          <span>{readingTime}</span>
        </div>
      </div>

      {/* Category tags */}
      {metadata.categories.length > 0 && (
        <div className="flex items-start gap-2">
          <Tag className="w-4 h-4 mt-0.5 text-stone-500 flex-shrink-0" />
          <div className="flex flex-wrap gap-1.5">
            {metadata.categories.map((category) => (
              <span
                key={category}
                className="px-2 py-0.5 text-xs rounded bg-stone-100 text-stone-700 border border-stone-200"
              >
                {category}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Abstract */}
      <div className="pt-3 border-t border-stone-200">
        <h3 className="text-sm font-medium text-stone-900 mb-2">Abstract</h3>
        <p className="text-sm text-stone-700 leading-relaxed line-clamp-6">
          {metadata.abstract}
        </p>
        {metadata.abstract.length > 400 && (
          <button
            onClick={() => onNavigateToPage?.(1)}
            className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline mt-1 font-medium"
          >
            Read full abstract →
          </button>
        )}
      </div>

      {/* ArXiv link */}
      {metadata.arxiv_id && (
        <div className="pt-2">
          <a
            href={`https://arxiv.org/abs/${metadata.arxiv_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium',
              'text-indigo-600 hover:text-indigo-700 hover:underline'
            )}
          >
            <ExternalLink className="w-4 h-4" />
            View on ArXiv ({metadata.arxiv_id})
          </a>
        </div>
      )}

      {/* OCR status notice */}
      {!hasOCRData && (
        <div className={cn(
          'flex items-start gap-2 p-3 rounded-lg',
          'bg-amber-50 border border-amber-200'
        )}>
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Limited AI Features
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              OCR data not available. Some AI features like image/table 
              interaction and precise citations may be limited.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaperOverviewCard;

