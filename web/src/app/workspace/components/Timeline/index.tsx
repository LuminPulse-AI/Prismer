'use client';

/**
 * Timeline
 *
 * Timeline component - Action recording and playback
 * Supports event detail preview and state snapshot navigation
 */

import React, { memo, useCallback, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward,
  FileText,
  Code,
  Edit3,
  Navigation,
  Zap,
  ChevronUp,
  ChevronDown,
  Bot,
  User,
  Clock,
  Activity,
} from 'lucide-react';
import type { ExtendedTimelineEvent, ComponentType } from '../../types';

// ============================================================
// Types
// ============================================================

interface TimelineProps {
  events: ExtendedTimelineEvent[];
  currentPosition: number;
  isPlaying: boolean;
  onSeek: (position: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onEventClick?: (event: ExtendedTimelineEvent) => void;
  duration?: number;
}

// ============================================================
// Helpers
// ============================================================

const getActionIcon = (action: ExtendedTimelineEvent['action']) => {
  const iconClass = 'w-2.5 h-2.5';
  switch (action) {
    case 'navigate':
      return <Navigation className={iconClass} />;
    case 'edit':
      return <Edit3 className={iconClass} />;
    case 'execute':
      return <Zap className={iconClass} />;
    case 'create':
      return <FileText className={iconClass} />;
    default:
      return <Code className={iconClass} />;
  }
};

const getComponentLabel = (component: ComponentType): string => {
  const labels: Record<ComponentType, string> = {
    'ai-editor': 'AI Editor',
    'pdf-reader': 'PDF',
    'latex-editor': 'LaTeX',
    'code-playground': 'Code',
    'jupyter-notebook': 'Jupyter',
    'bento-gallery': 'Gallery',
    'three-viewer': '3D',
    'ag-grid': 'Grid',
  };
  return labels[component] ?? component;
};

const getActionColors = (action: ExtendedTimelineEvent['action']): { bg: string; border: string; shadow: string } => {
  const colors: Record<string, { bg: string; border: string; shadow: string }> = {
    navigate: { bg: 'bg-sky-400', border: 'border-sky-300', shadow: 'shadow-sky-400/50' },
    edit: { bg: 'bg-amber-400', border: 'border-amber-300', shadow: 'shadow-amber-400/50' },
    execute: { bg: 'bg-emerald-400', border: 'border-emerald-300', shadow: 'shadow-emerald-400/50' },
    create: { bg: 'bg-violet-400', border: 'border-violet-300', shadow: 'shadow-violet-400/50' },
    delete: { bg: 'bg-rose-400', border: 'border-rose-300', shadow: 'shadow-rose-400/50' },
  };
  return colors[action] ?? { bg: 'bg-slate-400', border: 'border-slate-300', shadow: 'shadow-slate-400/50' };
};

// ============================================================
// Event Marker Component
// ============================================================

const EventMarker = memo(function EventMarker({
  event,
  position,
  isActive,
  onClick,
  onHover,
}: {
  event: ExtendedTimelineEvent;
  position: number;
  isActive: boolean;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
}) {
  const colors = getActionColors(event.action);
  
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.4, y: -1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={`
        absolute -translate-x-1/2
        w-2.5 h-2.5 rounded-full cursor-pointer
        border-2 ${colors.bg} ${colors.border}
        transition-shadow duration-200
        ${isActive ? `ring-2 ring-white shadow-lg ${colors.shadow}` : 'shadow-sm'}
      `}
      style={{ 
        left: `${position}%`,
        bottom: '50%',
        marginBottom: '-5px',
      }}
      title={event.description}
    />
  );
});

// ============================================================
// Event Detail Popup
// ============================================================

const EventDetailPopup = memo(function EventDetailPopup({
  event,
  position,
}: {
  event: ExtendedTimelineEvent;
  position: number;
}) {
  const isAgent = event.actorType === 'agent';
  const colors = getActionColors(event.action);

  // Clamp position to avoid overflow
  const clampedPosition = Math.max(15, Math.min(85, position));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="absolute bottom-full mb-4 z-50 pointer-events-none"
      style={{
        left: `${clampedPosition}%`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="bg-slate-900/95 backdrop-blur-sm text-white rounded-xl shadow-2xl p-3 min-w-[180px] max-w-[240px] border border-slate-700/50">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <div className={`p-1.5 rounded-lg ${colors.bg} shadow-sm`}>
            {getActionIcon(event.action)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white/90 leading-tight">
              {event.description}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {getComponentLabel(event.componentType)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-slate-400">
          {isAgent ? (
            <Bot className="w-3 h-3 text-violet-400" />
          ) : (
            <User className="w-3 h-3 text-sky-400" />
          )}
          <span className="truncate">{event.actorId}</span>
          <Clock className="w-3 h-3 ml-auto" />
          <span>
            {new Date(event.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </span>
        </div>

        {/* Arrow */}
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900/95 border-r border-b border-slate-700/50 rotate-45" />
      </div>
    </motion.div>
  );
});

// ============================================================
// Event List Panel
// ============================================================

const EventListPanel = memo(function EventListPanel({
  events,
  onEventClick,
}: {
  events: ExtendedTimelineEvent[];
  onEventClick?: (event: ExtendedTimelineEvent) => void;
}) {
  return (
    <div className="max-h-[200px] overflow-y-auto bg-slate-50/50">
      {events.map((event, index) => {
        const colors = getActionColors(event.action);
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onEventClick?.(event)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/80 transition-colors text-left border-b border-slate-100/80 last:border-0"
          >
            <span className="text-[10px] text-slate-400 w-5 text-right font-mono">
              {index + 1}
            </span>
            <div className={`p-1.5 rounded-lg ${colors.bg} shadow-sm`}>
              {getActionIcon(event.action)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-700 truncate font-medium">
                {event.description}
              </div>
              <div className="text-[10px] text-slate-400">
                {getComponentLabel(event.componentType)}
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {new Date(event.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
});

// ============================================================
// Main Component
// ============================================================

export const Timeline = memo(function Timeline({
  events,
  currentPosition,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  onEventClick,
  duration: propDuration,
}: TimelineProps) {
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const firstEventTimeRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Track elapsed time from first event
  React.useEffect(() => {
    if (events.length > 0 && firstEventTimeRef.current === null) {
      const ts = events[0].timestamp;
      firstEventTimeRef.current = typeof ts === 'number' ? ts : new Date(ts).getTime();
    }
    if (firstEventTimeRef.current === null) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - firstEventTimeRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [events]);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      onSeek(percent);
    },
    [onSeek]
  );

  const formatTime = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate duration from events or use elapsed time
  const duration = useMemo(() => {
    if (propDuration && propDuration > 0) return propDuration;
    if (events.length === 0) return elapsedTime;
    // Ensure timestamps are numeric (could be ISO strings from server)
    const firstTime = typeof events[0].timestamp === 'number' ? events[0].timestamp : new Date(events[0].timestamp).getTime();
    const lastTime = typeof events[events.length - 1].timestamp === 'number' ? events[events.length - 1].timestamp : new Date(events[events.length - 1].timestamp).getTime();
    const diff = Math.floor((lastTime - firstTime) / 1000);
    return Number.isFinite(diff) ? Math.max(diff, elapsedTime) : elapsedTime;
  }, [propDuration, events, elapsedTime]);

  const currentTime = (currentPosition / 100) * duration;

  // Calculate event positions - evenly distributed between 5%-95%
  const eventPositions = useMemo(() => {
    if (events.length === 0) return [];
    if (events.length === 1) {
      return [{ event: events[0], position: 50 }];
    }
    
    // Distribute events evenly across the timeline
    const padding = 5; // 5% padding on each side
    const usableWidth = 100 - (padding * 2);
    
    return events.map((event, index) => ({
      event,
      position: padding + (index / (events.length - 1)) * usableWidth,
    }));
  }, [events]);

  const hoveredEvent = useMemo(() => {
    if (!hoveredEventId) return null;
    return eventPositions.find((ep) => ep.event.id === hoveredEventId);
  }, [hoveredEventId, eventPositions]);

  // If no events, show simplified version with timer
  if (events.length === 0) {
    return (
      <div className="rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Session</span>
          </div>
          <span className="text-sm text-slate-600 font-mono tabular-nums">{formatTime(elapsedTime)}</span>
          <div className="flex-1 h-1 bg-slate-200 rounded-full" />
          <span className="text-xs text-slate-400">No events</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Expanded event list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-b border-slate-200/60 overflow-hidden"
          >
            <EventListPanel events={events} onEventClick={onEventClick} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main timeline controls */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Expand/collapse button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-500 transition-all hover:text-slate-700"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>

        {/* Event count */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-200/60">
          <Activity className="w-3 h-3 text-slate-500" />
          <span className="text-[11px] text-slate-600 font-medium tabular-nums">
            {events.length}
          </span>
        </div>

        {/* Timeline track */}
        <div 
          ref={trackRef}
          onClick={handleTrackClick}
          className="flex-1 relative h-8 cursor-pointer group"
        >
          {/* Track background */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            {/* Progress fill */}
            <motion.div
              className="h-full bg-gradient-to-r from-slate-400 to-slate-500 rounded-full"
              style={{ width: `${currentPosition}%` }}
              layout
              transition={{ duration: 0.1 }}
            />
          </div>

          {/* Event marker points */}
          {eventPositions.map(({ event, position }) => (
            <EventMarker
              key={event.id}
              event={event}
              position={position}
              isActive={hoveredEventId === event.id}
              onClick={() => onEventClick?.(event)}
              onHover={(hovered) => setHoveredEventId(hovered ? event.id : null)}
            />
          ))}

          {/* Current position indicator */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-slate-800 rounded-full shadow-lg border-2 border-white z-20 cursor-grab active:cursor-grabbing"
            style={{ left: `${currentPosition}%` }}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.95 }}
          />

          {/* Event detail popup */}
          <AnimatePresence>
            {hoveredEvent && (
              <EventDetailPopup
                event={hoveredEvent.event}
                position={hoveredEvent.position}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Time display */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-200/60">
          <span className="text-[11px] text-slate-600 font-mono tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-[11px] text-slate-400">/</span>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentPosition - 10))}
            className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-500 transition-all hover:text-slate-700"
            aria-label="Skip back"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={isPlaying ? onPause : onPlay}
            className="p-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 transition-all shadow-sm hover:shadow-md active:scale-95"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
          
          <button
            type="button"
            onClick={() => onSeek(Math.min(100, currentPosition + 10))}
            className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-500 transition-all hover:text-slate-700"
            aria-label="Skip forward"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default Timeline;
