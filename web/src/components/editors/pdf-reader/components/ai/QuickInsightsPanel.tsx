/**
 * Quick Insights Panel
 * 
 * Auto-generated paper insights panel (IMRAD paradigm)
 * - Auto-generates insights when paper loads
 * - Renders content as Markdown
 * - Supports IMRAD paradigm analysis
 *
 * Updated: uses InsightStore for insight caching
 */

"use client";

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Target,
  Lightbulb,
  BarChart3,
  AlertTriangle,
  Compass,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaperInsight, InsightType, SourceCitation } from '@/types/paperContext';
import { useAIStore } from '../../store/aiStore';
import { useCitationStore } from '../../store/citationStore';
import {
  useInsightStore,
  useCurrentInsights,
  useInsightLoading,
} from '../../store/insightStore';
import { InlineCitation } from '../ui/CitationTag';
import {
  getDefaultPaperAgentService,
  createAgentConfigAsync,
} from '../../services/paperAgentService';

// ============================================================
// Types
// ============================================================

interface QuickInsightsPanelProps {
  onNavigateToPage?: (pageNumber: number) => void;
  className?: string;
}

// ============================================================
// Insight Configuration
// ============================================================

// IMRAD-based insight configuration
const INSIGHT_CONFIG: Record<InsightType, {
  icon: React.ReactNode;
  label: string;
  imradLabel: string; // IMRAD section label
  color: string;
  bgColor: string;
}> = {
  core_problem: {
    icon: <Target className="w-4 h-4" />,
    label: 'Introduction',
    imradLabel: 'I',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  main_method: {
    icon: <Lightbulb className="w-4 h-4" />,
    label: 'Methods',
    imradLabel: 'M',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  key_results: {
    icon: <BarChart3 className="w-4 h-4" />,
    label: 'Results',
    imradLabel: 'R',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  limitations: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'Limitations',
    imradLabel: 'D',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  future_work: {
    icon: <Compass className="w-4 h-4" />,
    label: 'Future Work',
    imradLabel: 'D',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  custom: {
    icon: <Lightbulb className="w-4 h-4" />,
    label: 'Insight',
    imradLabel: '-',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  },
};

// ============================================================
// Sub-Components
// ============================================================

interface InsightCardProps {
  insight: PaperInsight;
  onNavigateToPage?: (pageNumber: number) => void;
  onToggleExpand: (id: string) => void;
}

const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  onNavigateToPage,
  onToggleExpand,
}) => {
  const config = INSIGHT_CONFIG[insight.type];
  const { scrollToDetection } = useCitationStore();
  
  // Extract [[detection_id]] references from the content
  const citationRefs = useMemo(() => {
    const refs: { id: string; index: number }[] = [];
    const pattern = /\[\[(p\d+_\w+_\d+)\]\]/g;
    let match: RegExpExecArray | null;
    let index = 1;
    while ((match = pattern.exec(insight.content)) !== null) {
      if (!refs.some(r => r.id === match![1])) {
        refs.push({ id: match![1], index: index++ });
      }
    }
    return refs;
  }, [insight.content]);

  // Processed content - replace [[id]] with placeholders
  const processedContent = useMemo(() => {
    let content = insight.content;
    citationRefs.forEach(ref => {
      content = content.replace(
        new RegExp(`\\[\\[${ref.id}\\]\\]`, 'g'),
        `<cite data-id="${ref.id}" data-index="${ref.index}"></cite>`
      );
    });
    return content;
  }, [insight.content, citationRefs]);

  const handleCitationClick = useCallback((citation: SourceCitation) => {
    if (citation.detection_id) {
      scrollToDetection(citation.detection_id);
    } else {
      onNavigateToPage?.(citation.pageNumber);
    }
  }, [onNavigateToPage, scrollToDetection]);

  return (
    <div
      className={cn(
        'rounded-lg border border-stone-200 overflow-hidden',
        'transition-shadow hover:shadow-md bg-white'
      )}
    >
      {/* Header */}
      <button
        onClick={() => onToggleExpand(insight.id)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5',
          config.bgColor,
          'hover:opacity-90 transition-opacity'
        )}
      >
        <span className={config.color}>{config.icon}</span>
        <span className={cn('font-medium text-sm', config.color)}>
          {config.label}
        </span>
        <span className="flex-1" />
        {/* Citation count badge */}
        {citationRefs.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-white/50 rounded text-stone-600">
            {citationRefs.length} refs
          </span>
        )}
        {insight.expanded ? (
          <ChevronDown className={cn('w-4 h-4', config.color)} />
        ) : (
          <ChevronRight className={cn('w-4 h-4', config.color)} />
        )}
      </button>

      {/* Content - rendered as Markdown */}
      <AnimatePresence>
        {insight.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 py-3 bg-white">
              <div className="prose prose-sm prose-stone max-w-none text-stone-700">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Custom heading styles (remove the ## headers from IMRAD prompts)
                    h2: ({ children }) => (
                      <h3 className="text-sm font-semibold text-stone-800 mt-2 mb-1">
                        {children}
                      </h3>
                    ),
                    h3: ({ children }) => (
                      <h4 className="text-sm font-medium text-stone-700 mt-1.5 mb-0.5">
                        {children}
                      </h4>
                    ),
                    // Compact paragraphs
                    p: ({ children }) => (
                      <p className="text-sm text-stone-700 leading-relaxed my-1">
                        {children}
                      </p>
                    ),
                    // Bold styling
                    strong: ({ children }) => (
                      <strong className="font-semibold text-stone-800">{children}</strong>
                    ),
                    // Italic styling  
                    em: ({ children }) => (
                      <em className="text-stone-600 italic">{children}</em>
                    ),
                    // Code styling - also handle citation placeholders
                    code: ({ children }) => {
                      // Check if this is a citation placeholder
                      const text = String(children);
                      const citeMatch = text.match(/^cite:(p\d+_\w+_\d+):(\d+)$/);
                      if (citeMatch) {
                        return (
                          <InlineCitation 
                            detectionId={citeMatch[1]} 
                            index={parseInt(citeMatch[2])} 
                          />
                        );
                      }
                      return (
                        <code className="px-1 py-0.5 bg-stone-100 rounded text-xs font-mono text-stone-700">
                          {children}
                        </code>
                      );
                    },
                    // List styling
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-0.5 my-1">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-0.5 my-1">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm text-stone-700">{children}</li>
                    ),
                  }}
                >
                  {processedContent
                    // First add spaces between consecutive cite tags
                    .replace(/<\/cite><cite/g, '</cite> <cite')
                    // Then convert to backtick format
                    .replace(
                      /<cite data-id="([^"]+)" data-index="(\d+)"><\/cite>/g, 
                      '`cite:$1:$2`'
                    )
                  }
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export const QuickInsightsPanel: React.FC<QuickInsightsPanelProps> = ({
  onNavigateToPage,
  className,
}) => {
  // AI Store - for paper context (document-level state)
  const { paperContext } = useAIStore();
  
  // Insight Store - for insights management (paper-level cache)
  const {
    setInsights,
    setCurrentPaper,
    hasValidCache,
    setLoading: setInsightsLoading,
  } = useInsightStore();
  
  const insights = useCurrentInsights();
  const loading = useInsightLoading();
  
  // Local state for insight expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  const [agentReady, setAgentReady] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const agentRef = useRef(getDefaultPaperAgentService());
  const hasAutoGeneratedRef = useRef<string | null>(null);
  
  // Get current paper ID
  const currentPaperId = paperContext?.source?.arxivId || null;

  // Initialize Agent - API key managed by the server
  useEffect(() => {
    const initAgent = async () => {
      try {
        const config = await createAgentConfigAsync();
        await agentRef.current.initialize(config);
        setAgentReady(true);
        setAgentError(null);
      } catch (error) {
        console.error('Failed to initialize agent:', error);
        setAgentError(error instanceof Error ? error.message : 'Failed to initialize agent');
      }
    };
    initAgent();
  }, []);

  // Set current paper in InsightStore when paper changes
  useEffect(() => {
    if (currentPaperId) {
      setCurrentPaper(currentPaperId);
    }
  }, [currentPaperId, setCurrentPaper]);

  // Toggle insight expansion (local state)
  const toggleInsightExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Get insights with expanded state
  const insightsWithExpanded = useMemo(() => {
    return insights.map((insight, index) => ({
      ...insight,
      // Default: first insight expanded
      expanded: expandedIds.size === 0 ? index === 0 : expandedIds.has(insight.id),
    }));
  }, [insights, expandedIds]);

  const handleGenerateInsights = useCallback(async () => {
    if (!agentReady || !paperContext || !currentPaperId) {
      console.error('Agent not ready or no paper context');
      return;
    }

    setInsightsLoading(true);
    
    try {
      // Call Agent Service to generate insights (using IMRAD paradigm)
      const generatedInsights = await agentRef.current.generateInsights(
        paperContext,
        ['core_problem', 'main_method', 'key_results', 'limitations', 'future_work']
      );
      
      // Save to InsightStore with paper context
      setInsights(currentPaperId, generatedInsights, paperContext.metadata?.title);
      
      // Auto-expand first insight
      if (generatedInsights.length > 0) {
        setExpandedIds(new Set([generatedInsights[0].id]));
      }
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setInsightsLoading(false);
    }
  }, [agentReady, paperContext, currentPaperId, setInsightsLoading, setInsights]);

  // Auto-generate Insights when paper loads and agent is ready
  useEffect(() => {
    // Skip if:
    // 1. Agent not ready or has error
    // 2. No paper context
    // 3. Already have valid cache for this paper
    // 4. Already auto-generated for this paper
    // 5. Currently loading
    if (!agentReady || agentError || !paperContext || !currentPaperId) {
      return;
    }
    
    // Check if we already have valid cache
    if (hasValidCache(currentPaperId)) {
      console.log(`[QuickInsights] Using cached insights for: ${currentPaperId}`);
      return;
    }
    
    // Check if we already auto-generated for this paper
    if (hasAutoGeneratedRef.current === currentPaperId) {
      return;
    }
    
    // Check if paper has content
    if (!paperContext.hasOCRData && !paperContext.markdown) {
      return;
    }
    
    // Don't generate if already loading
    if (loading) {
      return;
    }
    
    // Mark as auto-generated for this paper
    hasAutoGeneratedRef.current = currentPaperId;
    
    // Delay to let UI render first
    const timer = setTimeout(() => {
      handleGenerateInsights();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [agentReady, agentError, paperContext, currentPaperId, hasValidCache, loading, handleGenerateInsights]);

  // Sort insights by type (IMRAD order)
  const sortedInsights = useMemo(() => {
    const order: InsightType[] = ['core_problem', 'main_method', 'key_results', 'limitations', 'future_work'];
    return [...insightsWithExpanded].sort((a, b) => {
      return order.indexOf(a.type) - order.indexOf(b.type);
    });
  }, [insightsWithExpanded]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-stone-50">
        <div>
          <h3 className="text-sm font-medium text-stone-900">
            Quick Insights
          </h3>
          <p className="text-xs text-stone-500">
            AI-generated paper analysis
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateInsights}
          disabled={loading || !agentReady || !!agentError || (!paperContext?.hasOCRData && !paperContext?.markdown)}
          className="h-8 border-stone-300 text-stone-700 hover:bg-stone-100"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-1.5">
            {insights.length > 0 ? 'Refresh' : 'Generate'}
          </span>
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
            <p className="text-sm text-stone-700">Analyzing paper...</p>
            <p className="text-xs text-stone-500 mt-1">
              This may take a moment
            </p>
          </div>
        ) : sortedInsights.length > 0 ? (
          <div className="space-y-3">
            {sortedInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onNavigateToPage={onNavigateToPage}
                onToggleExpand={toggleInsightExpanded}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {agentError ? (
              <>
                <AlertCircle className="w-12 h-12 text-amber-500 opacity-60 mb-3" />
                <p className="text-sm text-stone-700">
                  AI Agent Configuration Required
                </p>
                <p className="text-xs text-amber-600 mt-1 max-w-[200px]">
                  {agentError}
                </p>
              </>
            ) : (
              <>
                <Lightbulb className="w-12 h-12 text-stone-400 opacity-60 mb-3" />
                <p className="text-sm text-stone-700">
                  No insights generated yet
                </p>
                <p className="text-xs text-stone-500 mt-1 max-w-[200px]">
                  Click &quot;Generate&quot; to analyze the paper and extract key insights
                </p>
                {!paperContext?.hasOCRData && !paperContext?.markdown && (
                  <p className="text-xs text-amber-600 mt-2 font-medium">
                    Paper content required for insights generation
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickInsightsPanel;
