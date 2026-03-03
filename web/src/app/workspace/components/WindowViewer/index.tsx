'use client';

/**
 * WindowViewer
 * 
 * Component container — includes tab bar, component area, timeline, and diff display.
 */

import React, { memo, Suspense, lazy, useEffect, Component, ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle, RefreshCw, Server } from 'lucide-react';
import { ComponentTabs } from './ComponentTabs';
import { Timeline } from '../Timeline';
import { DiffViewer } from '../DiffViewer';
import type { ComponentType, ExtendedTimelineEvent, DiffChange } from '../../types';
import type { ConnectionStatus } from '../ConnectionIndicator';
import { useComponentStore } from '../../stores/componentStore';

// Lazy-loaded component map
const componentLoaders: Record<ComponentType, () => Promise<{ default: React.ComponentType }>> = {
  'ai-editor': () => import('@/components/editors/previews/AiEditorPreview'),
  'pdf-reader': () => import('@/components/editors/previews/PDFReaderPreview'),
  'latex-editor': () => import('@/components/editors/previews/LatexEditorPreview'),
  'code-playground': () => import('@/components/editors/previews/CodePlaygroundPreview'),
  'bento-gallery': () => import('@/components/editors/previews/BentoGalleryPreview'),
  'three-viewer': () => import('@/components/editors/previews/ThreeViewerPreview'),
  'ag-grid': () => import('@/components/editors/previews/AGGridPreview'),
  'jupyter-notebook': () => import('@/components/editors/previews/JupyterNotebookPreview'),
};

const lazyComponents = Object.fromEntries(
  Object.entries(componentLoaders).map(([type, loader]) => [type, lazy(loader)])
) as Record<ComponentType, React.LazyExoticComponent<React.ComponentType>>;

interface WindowViewerProps {
  activeComponent: ComponentType;
  onComponentChange: (type: ComponentType) => void;
  timeline: ExtendedTimelineEvent[];
  currentPosition: number;
  isPlaying: boolean;
  onSeek: (position: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onTimelineEventClick?: (event: ExtendedTimelineEvent) => void;
  // Diff display
  activeDiff?: {
    component: ComponentType;
    file?: string;
    changes: DiffChange[];
  } | null;
  onDiffClose?: () => void;
  // Chat panel toggle
  chatExpanded?: boolean;
  onChatToggle?: () => void;
  // Connection status
  connectionStatus?: ConnectionStatus;
  workspaceName?: string;
  agentId?: string;
  connectedAt?: Date;
  connectionError?: string;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  onOpenSettings?: () => void;
  /** When true, renders a blocking overlay preventing interaction with editors */
  disabled?: boolean;
  className?: string;
}

interface LoadingFallbackProps {
  activeComponent: ComponentType;
  aiEditorHtml?: string;
  latexCompileStatus?: string;
  latexCompiledPdfUrl?: string;
}

// Loading placeholder
function LoadingFallback({
  activeComponent,
  aiEditorHtml,
  latexCompileStatus,
  latexCompiledPdfUrl,
}: LoadingFallbackProps) {
  const hasLatexCompileSuccess =
    activeComponent === 'latex-editor' &&
    (latexCompileStatus === 'success' || !!latexCompiledPdfUrl);
  const hasAiEditorContent = activeComponent === 'ai-editor' && !!aiEditorHtml?.trim();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100/50 px-6">
      <div className="relative">
        <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl animate-pulse" />
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin relative" />
      </div>
      <span className="mt-4 text-sm text-slate-500">Loading component...</span>

      {hasLatexCompileSuccess && (
        <div
          data-testid="compile-status"
          className="mt-4 px-3 py-2 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm"
        >
          Compiled successfully
        </div>
      )}

      {hasAiEditorContent && (
        <div className="mt-4 w-full max-w-3xl max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white/80 p-4">
          <div
            className="prose prose-sm max-w-none text-slate-800"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(aiEditorHtml || '') }}
          />
        </div>
      )}
    </div>
  );
}

// Error boundary
interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
  componentName: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ComponentErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-slate-50 p-8">
          <div className="p-4 rounded-full bg-amber-100 mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Component failed to load
          </h3>
          <p className="text-sm text-slate-500 text-center max-w-md mb-4">
            {this.props.componentName} encountered an error while loading.
            {this.state.error?.message && (
              <span className="block mt-1 font-mono text-xs text-slate-400">
                {this.state.error.message}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const componentNames: Record<ComponentType, string> = {
  'ai-editor': 'AI Editor',
  'pdf-reader': 'PDF Reader',
  'latex-editor': 'LaTeX Editor',
  'code-playground': 'Code Playground',
  'bento-gallery': 'Gallery',
  'three-viewer': '3D Viewer',
  'ag-grid': 'Data Grid',
  'jupyter-notebook': 'Jupyter Notebook',
};

export const WindowViewer = memo(function WindowViewer({
  activeComponent,
  onComponentChange,
  timeline,
  currentPosition,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  onTimelineEventClick,
  activeDiff,
  onDiffClose,
  chatExpanded,
  onChatToggle,
  connectionStatus,
  workspaceName,
  agentId,
  connectedAt,
  connectionError,
  onReconnect,
  onDisconnect,
  onOpenSettings,
  disabled = false,
  className = '',
}: WindowViewerProps) {
  const ActiveComponent = lazyComponents[activeComponent];
  const aiEditorHtml = useComponentStore((s) => s.componentStates['ai-editor']?.content as string | undefined);
  const latexCompileStatus = useComponentStore((s) => s.componentStates['latex-editor']?.compileStatus as string | undefined);
  const latexCompiledPdfUrl = useComponentStore((s) => s.componentStates['latex-editor']?.compiledPdfUrl as string | undefined);

  useEffect(() => {
    // Preload the heaviest editors so first directive-driven switch is less likely to miss updates.
    componentLoaders['ai-editor']().catch(() => {});
    componentLoaders['latex-editor']().catch(() => {});
  }, []);

  // Check whether to show diff overlay
  const showDiff = activeDiff && activeDiff.component === activeComponent && activeDiff.changes.length > 0;

  return (
    <div className={`flex flex-col h-full px-2 gap-2 ${className}`} data-active-component={activeComponent}>
      {/* Tab bar */}
      <ComponentTabs
        activeComponent={activeComponent}
        onComponentChange={onComponentChange}
        chatExpanded={chatExpanded}
        onChatToggle={onChatToggle}
        connectionStatus={connectionStatus}
        workspaceName={workspaceName}
        agentId={agentId}
        connectedAt={connectedAt}
        connectionError={connectionError}
        onReconnect={onReconnect}
        onDisconnect={onDisconnect}
        onOpenSettings={onOpenSettings}
      />

      {/* Component area */}
      <div className="flex-1 overflow-hidden relative rounded-xl bg-white border border-slate-200/60 shadow-sm">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeComponent}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            <ComponentErrorBoundary
              componentName={componentNames[activeComponent]}
              onReset={() => onComponentChange(activeComponent)}
            >
              <Suspense
                fallback={
                  <LoadingFallback
                    activeComponent={activeComponent}
                    aiEditorHtml={aiEditorHtml}
                    latexCompileStatus={latexCompileStatus}
                    latexCompiledPdfUrl={latexCompiledPdfUrl}
                  />
                }
              >
                <ActiveComponent />
              </Suspense>
            </ComponentErrorBoundary>
          </motion.div>
        </AnimatePresence>

        {/* Diff Overlay */}
        <AnimatePresence>
          {showDiff && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 left-4 right-4 z-20"
            >
              <DiffViewer
                changes={activeDiff.changes}
                fileName={activeDiff.file}
                onClose={onDiffClose}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Disabled overlay — blocks interaction when agent not ready */}
        {disabled && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
            <div className="text-center text-slate-400">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Start the agent to use workspace tools</p>
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <Timeline
        events={timeline}
        currentPosition={currentPosition}
        isPlaying={isPlaying}
        onSeek={onSeek}
        onPlay={onPlay}
        onPause={onPause}
        onEventClick={onTimelineEventClick}
      />
    </div>
  );
});

export default WindowViewer;
