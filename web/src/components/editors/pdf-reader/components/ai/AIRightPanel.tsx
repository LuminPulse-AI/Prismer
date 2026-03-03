/**
 * AI Right Panel (Ingest)
 * 
 * Right panel for the AI-Native reader
 * Contains: Chat and Notes modules
 * (Insights has been moved to the left sidebar)
 * Tab switching is displayed as icons in the title bar
 */

"use client";

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MessageSquare,
  FileEdit,
  Inbox,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAIStore } from '../../store/aiStore';
import { useCitationStore, selectDetectionStats } from '../../store/citationStore';
import { useSessionMessages } from '../../store/chatSessionStore';
import { AskPaperChat } from './AskPaperChat';
import { NotesPanel } from './NotesPanel';

// ============================================================
// Types
// ============================================================

type PanelTab = 'chat' | 'notes';

interface AIRightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onWidthChange?: (width: number) => void;
  className?: string;
  /** Callback to navigate to a specific page */
  onNavigateToPage?: (pageNumber: number) => void;
}

// ============================================================
// Tab Configuration
// ============================================================

const TABS: Array<{
  id: PanelTab;
  label: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  comingSoon?: boolean;
}> = [
  {
    id: 'chat',
    label: 'Chat',
    IconComponent: MessageSquare,
  },
  {
    id: 'notes',
    label: 'Notes',
    IconComponent: FileEdit,
    disabled: true,
    comingSoon: true,
  },
];

// ============================================================
// Constants
// ============================================================

// Width range - default ~35% ratio (approx. 590px on a 1680px screen)
const MIN_WIDTH = 320;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 500;

// ============================================================
// Component
// ============================================================

export const AIRightPanel: React.FC<AIRightPanelProps> = ({
  isOpen,
  onClose,
  onWidthChange,
  className,
  onNavigateToPage,
}) => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  
  const {
    rightPanelActiveTab,
    setRightPanelTab,
    extracts,
  } = useAIStore();
  
  // Get chat message count for badge from session store
  const chatMessages = useSessionMessages();
  
  // If the active tab is insights, auto-switch to chat (insights moved to left sidebar)
  useEffect(() => {
    if (rightPanelActiveTab === 'insights') {
      setRightPanelTab('chat');
    }
  }, [rightPanelActiveTab, setRightPanelTab]);

  // Citation Store - bidirectional index state
  const citationStore = useCitationStore();
  const citationStats = useMemo(() => selectDetectionStats(citationStore), [citationStore]);
  const { activeCitations, isLoaded: citationsLoaded } = citationStore;

  // Handle drag-to-resize width
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      setWidth(newWidth);
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onWidthChange]);

  // Get the badge count for the current tab
  const getTabBadge = (tabId: PanelTab): number | null => {
    switch (tabId) {
      case 'chat':
        return chatMessages.length > 0 ? chatMessages.length : null;
      case 'notes':
        return extracts.length > 0 ? extracts.length : null;
      default:
        return null;
    }
  };

  // Currently active tab (excluding insights)
  const activeTab: PanelTab = rightPanelActiveTab === 'insights' ? 'chat' : rightPanelActiveTab as PanelTab;

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <AskPaperChat
            onNavigateToPage={onNavigateToPage}
          />
        );
      case 'notes':
        return (
          <NotesPanel
            extracts={extracts}
          />
        );
      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'unified-right-panel flex-shrink-0 h-full bg-white rounded-xl shadow-sm border border-stone-200/80',
        'flex flex-col overflow-hidden relative',
        isResizing && 'select-none',
        className
      )}
      style={{ width }}
    >
      {/* Resize handle - unified light gray semi-transparent style */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        {/* Background hover effect */}
        <div className={cn(
          "absolute inset-0 bg-transparent transition-colors",
          "group-hover:bg-stone-300/40 group-active:bg-indigo-300/50",
          isResizing && "bg-indigo-300/50"
        )} />
        {/* Drag indicator bar */}
        <div className={cn(
          "relative w-1 h-16 rounded-full transition-colors",
          "bg-stone-300/60 group-hover:bg-stone-400 group-active:bg-indigo-500",
          isResizing && "bg-indigo-500"
        )} />
      </div>

      {/* Header - contains icon-style tab navigation */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-200 bg-stone-50 rounded-t-xl">
        {/* Left side: icon-style tab navigation */}
        <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-1">
          {TABS.map((tab) => {
            const badge = getTabBadge(tab.id);
            const isActive = activeTab === tab.id;
            const isDisabled = tab.disabled;
            
            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && setRightPanelTab(tab.id as 'insights' | 'chat' | 'notes')}
                disabled={isDisabled}
                className={cn(
                  'relative flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200',
                  'group',
                  isDisabled
                    ? 'text-stone-300 cursor-not-allowed'
                    : isActive
                    ? 'bg-indigo-600 shadow-sm'
                    : 'text-stone-600 hover:bg-stone-200 hover:text-stone-800'
                )}
                title={tab.comingSoon ? `${tab.label} - Coming Soon` : tab.label}
              >
                <tab.IconComponent 
                  className={cn(
                    'w-4 h-4',
                    isDisabled ? 'text-stone-300' : isActive ? 'text-white' : 'text-stone-600'
                  )} 
                />
                {badge !== null && !isDisabled && (
                  <span className={cn(
                    'absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center',
                    'text-[10px] rounded-full font-medium',
                    isActive
                      ? 'bg-white text-indigo-600'
                      : 'bg-indigo-600 text-white'
                  )}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
                {/* Tooltip on hover */}
                <span className={cn(
                  'absolute top-full mt-1 px-2 py-1 text-xs bg-stone-800 text-white rounded',
                  'opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50'
                )}>
                  {tab.comingSoon ? `${tab.label} - Coming Soon` : tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right side: title, citation indicator, and close button */}
        <div className="flex items-center gap-2">
          {/* Bidirectional index status indicator */}
          {citationsLoaded && (
            <div className="flex items-center gap-1 px-2 py-1 bg-indigo-50 rounded-md" title={`${citationStats.total} indexed elements, ${activeCitations.length} active`}>
              <Link2 className="w-3 h-3 text-indigo-500" />
              <span className="text-[10px] font-medium text-indigo-600">
                {citationStats.total}
              </span>
              {activeCitations.length > 0 && (
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
              )}
            </div>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default AIRightPanel;
