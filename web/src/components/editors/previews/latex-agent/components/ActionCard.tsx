'use client';

/**
 * ActionCard - Rounded card component displaying a single agent action
 *
 * Supports displaying:
 * - Paper search
 * - Paper analysis
 * - Conclusion drawing
 * - Content writing
 */

import React, { useState, memo } from 'react';
import {
  Search,
  FileText,
  Lightbulb,
  PenTool,
  Brain,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  Loader2,
  AlertCircle,
  Clock,
  BookOpen,
} from 'lucide-react';
import type { AgentAction, PaperReference } from '../types';

interface ActionCardProps {
  action: AgentAction;
  isExpanded?: boolean;
  onToggle?: () => void;
  /** Height when expanded: 'normal' (default) or 'half' (50vh) */
  expandedHeight?: 'normal' | 'half';
}

const ActionIcon = ({ type, className = '' }: { type: AgentAction['type']; className?: string }) => {
  const iconClass = `h-3.5 w-3.5 ${className}`;
  
  switch (type) {
    case 'search_papers':
      return <Search className={`${iconClass} text-blue-400`} />;
    case 'analyze_paper':
      return <FileText className={`${iconClass} text-amber-400`} />;
    case 'draw_conclusion':
      return <Lightbulb className={`${iconClass} text-emerald-400`} />;
    case 'write_content':
      return <PenTool className={`${iconClass} text-violet-400`} />;
    case 'thinking':
      return <Brain className={`${iconClass} text-pink-400`} />;
    default:
      return <FileText className={`${iconClass} text-slate-400`} />;
  }
};

const StatusIndicator = ({ status }: { status: AgentAction['status'] }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />;
    case 'completed':
      return <Check className="h-3 w-3 text-emerald-400" />;
    case 'error':
      return <AlertCircle className="h-3 w-3 text-red-400" />;
    default:
      return <Clock className="h-3 w-3 text-slate-500" />;
  }
};

const PaperItem = memo(function PaperItem({ paper }: { paper: PaperReference }) {
  return (
    <div className="p-2 bg-slate-800/60 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-medium text-slate-200 line-clamp-2 leading-tight">
            {paper.title}
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {paper.authors.slice(0, 2).join(', ')}
            {paper.authors.length > 2 && ' et al.'}
            {' · '}
            {paper.year}
          </p>
        </div>
        <a
          href={paper.doi ? `https://doi.org/${paper.doi}` : '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 p-1 text-slate-500 hover:text-blue-400 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {paper.citations !== undefined && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-500">
          <BookOpen className="h-2.5 w-2.5" />
          <span>{paper.citations.toLocaleString()} citations</span>
        </div>
      )}
    </div>
  );
});

export const ActionCard = memo(function ActionCard({
  action,
  isExpanded = false,
  onToggle,
  expandedHeight = 'normal',
}: ActionCardProps) {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const expanded = onToggle ? isExpanded : localExpanded;
  const toggle = onToggle || (() => setLocalExpanded(!localExpanded));
  
  // Auto-expand when completed
  React.useEffect(() => {
    if (action.status === 'completed' && !localExpanded) {
      setLocalExpanded(true);
    }
  }, [action.status, localExpanded]);

  const hasDetails = Boolean(
    action.data?.papers?.length ||
    action.data?.keyPoints?.length ||
    action.data?.analysis ||
    action.data?.conclusion ||
    action.data?.content
  );

  const getBgGradient = () => {
    switch (action.type) {
      case 'search_papers':
        return 'from-blue-500/15 to-cyan-500/10';
      case 'analyze_paper':
        return 'from-amber-500/15 to-orange-500/10';
      case 'draw_conclusion':
        return 'from-emerald-500/15 to-green-500/10';
      case 'write_content':
        return 'from-violet-500/15 to-purple-500/10';
      case 'thinking':
        return 'from-pink-500/15 to-rose-500/10';
      default:
        return 'from-slate-500/15 to-slate-500/10';
    }
  };

  const getBorderColor = () => {
    switch (action.type) {
      case 'search_papers':
        return 'border-blue-500/40';
      case 'analyze_paper':
        return 'border-amber-500/40';
      case 'draw_conclusion':
        return 'border-emerald-500/40';
      case 'write_content':
        return 'border-violet-500/40';
      case 'thinking':
        return 'border-pink-500/40';
      default:
        return 'border-slate-500/40';
    }
  };

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br ${getBgGradient()} ${getBorderColor()} 
        w-full overflow-hidden transition-all duration-700 ease-out backdrop-blur-sm shadow-lg`}
    >
      {/* Header */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
        disabled={!hasDetails}
      >
        <ActionIcon type={action.type} />
        
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs text-slate-200 truncate">{action.description}</p>
          {action.duration && action.status === 'completed' && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {(action.duration / 1000).toFixed(1)}s
            </p>
          )}
        </div>

        <StatusIndicator status={action.status} />

        {hasDetails && (
          <div className="text-slate-500">
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </div>
        )}
      </button>

      {/* Expanded Content */}
      {expanded && hasDetails && (
        <div className={`px-4 pb-4 border-t border-slate-700/30 animate-in slide-in-from-top-2 duration-700 ease-out
          ${expandedHeight === 'half' ? 'min-h-[35vh] max-h-[50vh] overflow-y-auto' : ''}`}
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 transparent' }}>
          
          {/* Papers */}
          {action.data?.papers && action.data.papers.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-blue-400" />
                Found Papers ({action.data.papers.length})
              </p>
              <div className="space-y-2 pr-1">
                {action.data.papers.map((paper) => (
                  <PaperItem key={paper.id} paper={paper} />
                ))}
              </div>
            </div>
          )}

          {/* Key Points */}
          {action.data?.keyPoints && action.data.keyPoints.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                Key Insights
              </p>
              <ul className="space-y-1.5">
                {action.data.keyPoints.map((point, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-[12px] text-slate-300 leading-relaxed"
                  >
                    <span className="text-amber-400 font-bold">{index + 1}.</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Analysis */}
          {action.data?.analysis && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-cyan-400" />
                Analysis
              </p>
              <p className="text-[12px] text-slate-300 leading-relaxed bg-slate-800/40 rounded-xl p-3 border border-slate-700/30">
                {action.data.analysis}
              </p>
            </div>
          )}

          {/* Conclusion */}
          {action.data?.conclusion && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-emerald-400" />
                Conclusion
              </p>
              <p className="text-[12px] text-slate-200 leading-relaxed bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/30 italic">
                &ldquo;{action.data.conclusion}&rdquo;
              </p>
            </div>
          )}

          {/* Written Content Preview */}
          {action.data?.content && action.data?.section && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <PenTool className="h-3.5 w-3.5 text-violet-400" />
                Written to: {action.data.section}
              </p>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-violet-500/30"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 transparent' }}>
                <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {action.data.content}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ActionCard;
