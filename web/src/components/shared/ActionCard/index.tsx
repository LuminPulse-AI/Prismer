'use client';

/**
 * ActionCard - Generic agent action card component
 *
 * Supports two themes:
 * - dark: Dark background (for LaTeX Agent, etc.)
 * - light: Light background (for Workspace, etc.)
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
  Code,
  Play,
} from 'lucide-react';
import type { AgentAction, PaperReference } from './types';

// Re-export types
export type { AgentAction, AgentActionType, ActionStatus, PaperReference } from './types';

interface ActionCardProps {
  action: AgentAction;
  isExpanded?: boolean;
  onToggle?: () => void;
  /** Theme variant */
  variant?: 'dark' | 'light';
  /** Height when expanded: 'normal' (default) or 'half' (50vh) */
  expandedHeight?: 'normal' | 'half';
  className?: string;
}

const ActionIcon = ({ type, className = '' }: { type: AgentAction['type']; className?: string }) => {
  const iconClass = `h-4 w-4 ${className}`;
  
  switch (type) {
    case 'search_papers':
      return <Search className={iconClass} />;
    case 'analyze_paper':
      return <FileText className={iconClass} />;
    case 'draw_conclusion':
      return <Lightbulb className={iconClass} />;
    case 'write_content':
      return <PenTool className={iconClass} />;
    case 'execute_code':
      return <Code className={iconClass} />;
    case 'thinking':
      return <Brain className={iconClass} />;
    default:
      return <Play className={iconClass} />;
  }
};

const StatusIndicator = ({ status, variant }: { status: AgentAction['status']; variant: 'dark' | 'light' }) => {
  const baseClass = 'h-3.5 w-3.5';
  
  switch (status) {
    case 'running':
      return <Loader2 className={`${baseClass} text-blue-500 animate-spin`} />;
    case 'completed':
      return <Check className={`${baseClass} text-emerald-500`} />;
    case 'error':
      return <AlertCircle className={`${baseClass} text-red-500`} />;
    default:
      return <Clock className={`${baseClass} ${variant === 'dark' ? 'text-slate-500' : 'text-slate-400'}`} />;
  }
};

const PaperItem = memo(function PaperItem({ 
  paper, 
  variant 
}: { 
  paper: PaperReference; 
  variant: 'dark' | 'light';
}) {
  const isDark = variant === 'dark';
  
  return (
    <div className={`
      p-2.5 rounded-xl border transition-colors
      ${isDark 
        ? 'bg-slate-800/60 border-slate-700/50 hover:border-slate-600/50' 
        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
      }
    `}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className={`text-xs font-medium line-clamp-2 leading-tight ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
            {paper.title}
          </h4>
          <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            {paper.authors.slice(0, 2).join(', ')}
            {paper.authors.length > 2 && ' et al.'}
            {' · '}
            {paper.year}
          </p>
        </div>
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-shrink-0 p-1 transition-colors ${isDark ? 'text-slate-500 hover:text-blue-400' : 'text-slate-400 hover:text-blue-600'}`}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {paper.citations !== undefined && (
        <div className={`flex items-center gap-1 mt-1.5 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
          <BookOpen className="h-2.5 w-2.5" />
          <span>{paper.citations.toLocaleString()} citations</span>
        </div>
      )}
    </div>
  );
});

// Color configuration
const colorConfig: Record<AgentAction['type'], { icon: string; bgGradient: { dark: string; light: string }; border: { dark: string; light: string } }> = {
  search_papers: {
    icon: 'text-blue-500',
    bgGradient: { dark: 'from-blue-500/15 to-cyan-500/10', light: 'from-blue-50 to-cyan-50' },
    border: { dark: 'border-blue-500/40', light: 'border-blue-200' },
  },
  analyze_paper: {
    icon: 'text-amber-500',
    bgGradient: { dark: 'from-amber-500/15 to-orange-500/10', light: 'from-amber-50 to-orange-50' },
    border: { dark: 'border-amber-500/40', light: 'border-amber-200' },
  },
  draw_conclusion: {
    icon: 'text-emerald-500',
    bgGradient: { dark: 'from-emerald-500/15 to-green-500/10', light: 'from-emerald-50 to-green-50' },
    border: { dark: 'border-emerald-500/40', light: 'border-emerald-200' },
  },
  write_content: {
    icon: 'text-violet-500',
    bgGradient: { dark: 'from-violet-500/15 to-purple-500/10', light: 'from-violet-50 to-purple-50' },
    border: { dark: 'border-violet-500/40', light: 'border-violet-200' },
  },
  execute_code: {
    icon: 'text-cyan-500',
    bgGradient: { dark: 'from-cyan-500/15 to-teal-500/10', light: 'from-cyan-50 to-teal-50' },
    border: { dark: 'border-cyan-500/40', light: 'border-cyan-200' },
  },
  thinking: {
    icon: 'text-pink-500',
    bgGradient: { dark: 'from-pink-500/15 to-rose-500/10', light: 'from-pink-50 to-rose-50' },
    border: { dark: 'border-pink-500/40', light: 'border-pink-200' },
  },
};

export const ActionCard = memo(function ActionCard({
  action,
  isExpanded = false,
  onToggle,
  variant = 'light',
  expandedHeight = 'normal',
  className = '',
}: ActionCardProps) {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const expanded = onToggle ? isExpanded : localExpanded;
  const toggle = onToggle || (() => setLocalExpanded(!localExpanded));
  
  const isDark = variant === 'dark';
  const config = colorConfig[action.type] || colorConfig.thinking;
  
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

  return (
    <div
      className={`
        rounded-2xl border bg-gradient-to-br 
        ${isDark ? config.bgGradient.dark : config.bgGradient.light} 
        ${isDark ? config.border.dark : config.border.light} 
        w-full overflow-hidden transition-all duration-300 ease-out
        ${isDark ? 'backdrop-blur-sm shadow-lg' : 'shadow-sm'}
        ${className}
      `}
    >
      {/* Header */}
      <button
        type="button"
        onClick={toggle}
        className={`
          w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors
          ${isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'}
        `}
        disabled={!hasDetails}
      >
        <span className={config.icon}>
          <ActionIcon type={action.type} />
        </span>
        
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-sm truncate ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
            {action.description}
          </p>
          {action.duration && action.status === 'completed' && (
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              {(action.duration / 1000).toFixed(1)}s
            </p>
          )}
        </div>

        <StatusIndicator status={action.status} variant={variant} />

        {hasDetails && (
          <div className={isDark ? 'text-slate-500' : 'text-slate-400'}>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        )}
      </button>

      {/* Expanded Content */}
      {expanded && hasDetails && (
        <div 
          className={`
            px-4 pb-4 border-t animate-in slide-in-from-top-2 duration-300
            ${isDark ? 'border-slate-700/30' : 'border-slate-200'}
            ${expandedHeight === 'half' ? 'min-h-[35vh] max-h-[50vh] overflow-y-auto' : ''}
          `}
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* Papers */}
          {action.data?.papers && action.data.papers.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <Search className="h-3.5 w-3.5 text-blue-500" />
                Found Papers ({action.data.papers.length})
              </p>
              <div className="space-y-2">
                {action.data.papers.map((paper) => (
                  <PaperItem key={paper.id} paper={paper} variant={variant} />
                ))}
              </div>
            </div>
          )}

          {/* Key Points */}
          {action.data?.keyPoints && action.data.keyPoints.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                Key Insights
              </p>
              <ul className="space-y-1.5">
                {action.data.keyPoints.map((point, index) => (
                  <li
                    key={index}
                    className={`flex items-start gap-2 text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                  >
                    <span className="text-amber-500 font-bold text-xs">{index + 1}.</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Analysis */}
          {action.data?.analysis && (
            <div className="mt-3">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <FileText className="h-3.5 w-3.5 text-cyan-500" />
                Analysis
              </p>
              <p className={`
                text-sm leading-relaxed rounded-xl p-3 border
                ${isDark ? 'text-slate-300 bg-slate-800/40 border-slate-700/30' : 'text-slate-700 bg-slate-50 border-slate-200'}
              `}>
                {action.data.analysis}
              </p>
            </div>
          )}

          {/* Conclusion */}
          {action.data?.conclusion && (
            <div className="mt-3">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <Lightbulb className="h-3.5 w-3.5 text-emerald-500" />
                Conclusion
              </p>
              <p className={`
                text-sm leading-relaxed rounded-xl p-3 border italic
                ${isDark ? 'text-slate-200 bg-emerald-500/10 border-emerald-500/30' : 'text-slate-800 bg-emerald-50 border-emerald-200'}
              `}>
                &ldquo;{action.data.conclusion}&rdquo;
              </p>
            </div>
          )}

          {/* Written Content Preview */}
          {action.data?.content && (
            <div className="mt-3">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <PenTool className="h-3.5 w-3.5 text-violet-500" />
                {action.data.section ? `Written to: ${action.data.section}` : 'Generated Content'}
              </p>
              <div className={`
                p-3 rounded-xl border overflow-x-auto
                ${isDark ? 'bg-slate-900/80 border-violet-500/30' : 'bg-slate-900 border-slate-300'}
              `}>
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {typeof action.data.content === 'string' 
                    ? action.data.content.slice(0, 500) + (action.data.content.length > 500 ? '...' : '')
                    : JSON.stringify(action.data.content, null, 2)
                  }
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
