'use client';

/**
 * TaskPanel
 *
 * Task Panel - Three states: collapsed / 30% / 80%
 * - collapsed: Shows only the current task status bar
 * - 30%: Shows top-level task outline
 * - 80%: Shows second-level subtask details
 */

import React, { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronUp, 
  ChevronDown, 
  CheckCircle2, 
  Loader2, 
  Clock, 
  AlertCircle,
  Maximize2,
  Minimize2,
  ListTodo,
} from 'lucide-react';
import type { Task, SubTask, TaskPanelHeight, TaskStatus } from '../../types';

interface TaskPanelProps {
  height: TaskPanelHeight;
  onHeightChange: (height: TaskPanelHeight) => void;
  tasks: Task[];
  activeTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  /** Render as a rounded card (for bottom placement) */
  isCard?: boolean;
}

// Status color configuration
const statusConfig: Record<TaskStatus, { icon: React.ReactNode; bg: string; text: string; border: string }> = {
  completed: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
  },
  running: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-200',
  },
  pending: {
    icon: <Clock className="w-4 h-4" />,
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    border: 'border-slate-200',
  },
  error: {
    icon: <AlertCircle className="w-4 h-4" />,
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-200',
  },
};

const heightValues: Record<TaskPanelHeight, string> = {
  collapsed: '52px',
  '30%': '30%',
  '80%': '80%',
};

// Subtask component
const SubTaskItem = memo(function SubTaskItem({ subtask }: { subtask: SubTask }) {
  const config = statusConfig[subtask.status];
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg
        ${config.bg} ${config.border} border
      `}
    >
      <span className={config.text}>{config.icon}</span>
      <span className={`flex-1 text-xs ${config.text} truncate`}>
        {subtask.title}
      </span>
      {subtask.duration && subtask.status === 'completed' && (
        <span className="text-[10px] text-slate-400">
          {(subtask.duration / 1000).toFixed(1)}s
        </span>
      )}
    </motion.div>
  );
});

// Task card component
const TaskCard = memo(function TaskCard({
  task,
  isActive,
  isExpanded,
  onClick,
}: {
  task: Task;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const config = statusConfig[task.status];
  const completedSubtasks = task.subtasks?.filter((s) => s.status === 'completed').length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={`
        rounded-xl border overflow-hidden cursor-pointer
        transition-all duration-200
        ${isActive ? 'ring-2 ring-violet-500 shadow-sm' : 'hover:shadow-sm'}
        ${config.border}
      `}
      onClick={onClick}
    >
      {/* Task Header */}
      <div className={`flex items-center gap-3 px-3 py-2.5 ${config.bg}`}>
        <span className={config.text}>{config.icon}</span>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-slate-900 truncate">
            {task.title}
          </h4>
          {totalSubtasks > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">
              {completedSubtasks} / {totalSubtasks} subtasks done
            </p>
          )}
        </div>

        {/* Progress */}
        {task.progress !== undefined && (
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-xs font-medium ${config.text}`}>
              {task.progress}%
            </span>
            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${task.progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  task.status === 'completed' ? 'bg-emerald-500' :
                  task.status === 'running' ? 'bg-blue-500' :
                  task.status === 'error' ? 'bg-red-500' : 'bg-slate-400'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Subtasks (only in expanded mode) */}
      <AnimatePresence>
        {isExpanded && task.subtasks && task.subtasks.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-3 py-2 bg-white border-t border-slate-100 space-y-1.5"
          >
            {task.subtasks.map((subtask, index) => (
              <motion.div
                key={subtask.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <SubTaskItem subtask={subtask} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export const TaskPanel = memo(function TaskPanel({
  height,
  onHeightChange,
  tasks,
  activeTaskId,
  onTaskClick,
  isCard = false,
}: TaskPanelProps) {
  const currentTask = useMemo(() => {
    return tasks.find((t) => t.status === 'running') || tasks[0];
  }, [tasks]);

  const cycleHeight = () => {
    const next: TaskPanelHeight =
      height === 'collapsed' ? '30%' : height === '30%' ? '80%' : 'collapsed';
    onHeightChange(next);
  };

  const isCollapsed = height === 'collapsed';
  const isExpanded = height === '80%';

  // Stats
  const stats = useMemo(() => {
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const running = tasks.filter((t) => t.status === 'running').length;
    return { completed, running, total: tasks.length };
  }, [tasks]);

  // Card style classes
  const containerClasses = isCard
    ? 'bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'
    : 'border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white overflow-hidden';

  return (
    <motion.div
      animate={{ height: isCard ? 'auto' : heightValues[height] }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className={containerClasses}
    >
      {/* ===== Collapsed: show current task only ===== */}
      {isCollapsed && (
        <button
          type="button"
          onClick={cycleHeight}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100/50 transition-colors"
        >
          <div className="p-1.5 rounded-lg bg-violet-100">
            <ListTodo className="w-4 h-4 text-violet-600" />
          </div>
          
          {currentTask && currentTask.status !== 'pending' ? (
            <>
              <span className={statusConfig[currentTask.status].text}>
                {statusConfig[currentTask.status].icon}
              </span>
              <span className="flex-1 text-sm font-medium text-slate-900 text-left truncate">
                {currentTask.title}
              </span>
              {currentTask.progress !== undefined && currentTask.progress > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${currentTask.progress}%` }}
                      className="h-full bg-blue-500 rounded-full"
                    />
                  </div>
                  <span className="text-xs text-slate-500 font-mono w-8">
                    {currentTask.progress}%
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <span className="text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <span className="flex-1 text-sm text-slate-600 text-left">Ready for work</span>
            </>
          )}
          
          <ChevronUp className="w-4 h-4 text-slate-400" />
        </button>
      )}

      {/* ===== 30% / 80% state: show task list ===== */}
      {!isCollapsed && (
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-violet-100">
                <ListTodo className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-900">
                  Task Progress
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-emerald-600">{stats.completed} done</span>
                  <span>•</span>
                  <span className="text-blue-600">{stats.running} in progress</span>
                  <span>•</span>
                  <span>{stats.total} total</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onHeightChange(isExpanded ? '30%' : '80%')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                title={isExpanded ? 'Collapse details' : 'Expand details'}
              >
                {isExpanded ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onHeightChange('collapsed')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                title="Collapse panel"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Task List */}
          <div 
            className="flex-1 overflow-y-auto p-3 space-y-2"
            style={{ scrollbarWidth: 'thin' }}
          >
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isActive={activeTaskId === task.id}
                  isExpanded={isExpanded}
                  onClick={() => {
                    onTaskClick(task.id);
                    // Auto-expand to 80% when clicking a task
                    if (!isExpanded) onHeightChange('80%');
                  }}
                />
              ))}
            </AnimatePresence>

            {tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <ListTodo className="w-10 h-10 mb-3 text-slate-300" />
                <span className="text-sm">No tasks</span>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
});

export default TaskPanel;
