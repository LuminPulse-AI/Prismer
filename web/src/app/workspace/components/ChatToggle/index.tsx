'use client';

/**
 * ChatToggle
 *
 * SiriOrb + Task status bubble
 * Located at the bottom-left of WindowViewer, click to expand Chat Panel
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SiriOrb } from '@/components/ui/siri-orb';
import { TaskBubble } from './TaskBubble';
import type { Task } from '../../types';

interface ChatToggleProps {
  isExpanded: boolean;
  onToggle: () => void;
  currentTask?: Task | null;
  className?: string;
}

export const ChatToggle = memo(function ChatToggle({
  isExpanded,
  onToggle,
  currentTask,
  className = '',
}: ChatToggleProps) {
  return (
    <AnimatePresence>
      {!isExpanded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
          className={`absolute bottom-16 left-4 z-50 flex items-center gap-3 ${className}`}
        >
          {/* SiriOrb */}
          <button
            type="button"
            onClick={onToggle}
            className="group relative flex items-center justify-center rounded-full hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            aria-label="Expand chat panel"
          >
            <SiriOrb
              size="48px"
              animationDuration={8}
              className="drop-shadow-lg cursor-pointer"
            />
          </button>

          {/* Task status bubble */}
          {currentTask && (
            <TaskBubble
              task={currentTask}
              onClick={onToggle}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default ChatToggle;
