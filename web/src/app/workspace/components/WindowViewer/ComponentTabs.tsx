'use client';

/**
 * ComponentTabs
 *
 * Component switching tab bar - Supports horizontal scrolling + connection status indicator
 */

import React, { memo, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileEdit,
  FileText,
  FunctionSquare,
  Code2,
  GalleryHorizontal,
  Box,
  Table2,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Settings,
} from 'lucide-react';
import type { ComponentType } from '../../types';
import { DISABLED_COMPONENTS } from '../../types';
import { ConnectionIndicator, type ConnectionStatus } from '../ConnectionIndicator';

interface ComponentTabsProps {
  activeComponent: ComponentType;
  onComponentChange: (type: ComponentType) => void;
  chatExpanded?: boolean;
  onChatToggle?: () => void;
  // Connection status props
  connectionStatus?: ConnectionStatus;
  workspaceName?: string;
  agentId?: string;
  connectedAt?: Date;
  connectionError?: string;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  // Settings
  onOpenSettings?: () => void;
}

// Component configuration
const componentConfig: Record<ComponentType, {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
}> = {
  'ai-editor': {
    label: 'Notes',
    shortLabel: 'Notes',
    icon: <FileEdit className="w-4 h-4" />,
    color: 'text-violet-600',
  },
  'pdf-reader': {
    label: 'Reader',
    shortLabel: 'Reader',
    icon: <FileText className="w-4 h-4" />,
    color: 'text-rose-600',
  },
  'latex-editor': {
    label: 'LaTeX',
    shortLabel: 'LaTeX',
    icon: <FunctionSquare className="w-4 h-4" />,
    color: 'text-teal-600',
  },
  'code-playground': {
    label: 'Code',
    shortLabel: 'Code',
    icon: <Code2 className="w-4 h-4" />,
    color: 'text-amber-600',
  },
  'bento-gallery': {
    label: 'Gallery',
    shortLabel: 'Gallery',
    icon: <GalleryHorizontal className="w-4 h-4" />,
    color: 'text-pink-600',
  },
  'three-viewer': {
    label: '3D',
    shortLabel: '3D',
    icon: <Box className="w-4 h-4" />,
    color: 'text-blue-600',
  },
  'ag-grid': {
    label: 'Data',
    shortLabel: 'Data',
    icon: <Table2 className="w-4 h-4" />,
    color: 'text-emerald-600',
  },
  'jupyter-notebook': {
    label: 'Jupyter',
    shortLabel: 'Jupyter',
    icon: <FileCode2 className="w-4 h-4" />,
    color: 'text-orange-600',
  },
};

const componentOrder: ComponentType[] = ([
  'ai-editor',
  'pdf-reader',
  'latex-editor',
  'code-playground',
  'bento-gallery',
  'three-viewer',
  'ag-grid',
  'jupyter-notebook',
] as ComponentType[]).filter(c => !DISABLED_COMPONENTS.has(c));

export const ComponentTabs = memo(function ComponentTabs({
  activeComponent,
  onComponentChange,
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
}: ComponentTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll state
  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 150;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const hasRightSection = connectionStatus || onOpenSettings;

  return (
    <div className="flex items-stretch gap-2">
      {/* Left pill: Chat toggle */}
      {onChatToggle && (
        <button
          type="button"
          onClick={onChatToggle}
          className={`flex items-center justify-center w-10 rounded-xl backdrop-blur-sm border shadow-sm flex-shrink-0 transition-colors ${
            chatExpanded
              ? 'text-violet-600 bg-violet-50 border-violet-200/60'
              : 'text-slate-400 bg-white/80 border-slate-200/60 hover:text-slate-600 hover:bg-slate-50'
          }`}
          title={chatExpanded ? 'Hide Chat' : 'Show Chat'}
        >
          <MessageSquare className="w-4 h-4" />
        </button>
      )}

      {/* Center pill: Component tabs */}
      <div className="relative flex-1 min-w-0 flex items-center rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-sm">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-white via-white/80 to-transparent rounded-l-xl"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex-1 min-w-0 flex items-center gap-1 px-2 py-2 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {componentOrder.map((type) => {
            const config = componentConfig[type];
            const isActive = activeComponent === type;

            return (
              <button
                key={type}
                type="button"
                onClick={() => onComponentChange(type)}
                data-testid={`component-tab-${type}`}
                className={`
                  relative flex items-center gap-2 px-3 py-2 rounded-xl
                  text-sm font-medium whitespace-nowrap
                  transition-all duration-200
                  ${isActive
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                  }
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeComponentTab"
                    className="absolute inset-0 bg-white rounded-xl shadow-sm border border-slate-200/50"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className={`relative z-10 ${isActive ? config.color : ''}`}>
                  {config.icon}
                </span>
                <span className="relative z-10 hidden md:inline">{config.label}</span>
                <span className="relative z-10 inline md:hidden">{config.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Right scroll button */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll('right')}
            className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-white via-white/80 to-transparent rounded-r-xl"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        )}
      </div>

      {/* Right pill: Connection status + Settings */}
      {hasRightSection && (
        <div className="flex items-center gap-1 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-sm px-2 flex-shrink-0">
          {connectionStatus && (
            <div className="flex items-center px-1">
              <ConnectionIndicator
                status={connectionStatus}
                workspaceName={workspaceName}
                agentId={agentId}
                connectedAt={connectedAt}
                errorMessage={connectionError}
                onReconnect={onReconnect}
                onDisconnect={onDisconnect}
              />
            </div>
          )}

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center justify-center w-8 rounded-lg flex-shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Workspace Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default ComponentTabs;
