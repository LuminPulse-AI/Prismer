'use client';

/**
 * TaskBubble
 *
 * Task status bubble component
 * Displays the current task name, progress, and status
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { Task, TaskStatus } from '../../types';

interface TaskBubbleProps {
  task: Task;
  onClick?: () => void;
}

const statusConfig: Record<TaskStatus, {
  bg: string;
  border: string;
  icon: React.ReactNode;
}> = {
  running: {
    bg: 'bg-blue-500/90',
    border: 'border-blue-400',
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
  },
  completed: {
    bg: 'bg-emerald-500/90',
    border: 'border-emerald-400',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  error: {
    bg: 'bg-red-500/90',
    border: 'border-red-400',
    icon: <XCircle className="w-4 h-4" />,
  },
  pending: {
    bg: 'bg-slate-500/90',
    border: 'border-slate-400',
    icon: <Clock className="w-4 h-4" />,
  },
};

export const TaskBubble = memo(function TaskBubble({
  task,
  onClick,
}: TaskBubbleProps) {
  const config = statusConfig[task.status];
  const progress = task.progress ?? 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-2xl
        ${config.bg} ${config.border} border
        text-white text-sm font-medium
        backdrop-blur-sm shadow-lg
        cursor-pointer select-none
        max-w-[400px] min-w-[200px]
        focus:outline-none focus:ring-2 focus:ring-white/30
      `}
    >
      {/* Status icon */}
      <span className="flex-shrink-0">{config.icon}</span>

      {/* Task info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="truncate font-medium">{task.title}</div>
        {task.status === 'running' && (
          <div className="flex items-center gap-2 mt-1">
            {/* Progress bar */}
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/80 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs text-white/80">{progress}%</span>
          </div>
        )}
      </div>
    </motion.button>
  );
});

export default TaskBubble;
