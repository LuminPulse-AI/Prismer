'use client';

/**
 * ProgressCard
 *
 * Progress card interactive component - Displays task progress
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Check, Circle, Loader2 } from 'lucide-react';
import type { ProgressCardComponent } from '../../types';

interface ProgressCardProps {
  config: ProgressCardComponent;
  onAction?: (actionId: string) => void;
}

export const ProgressCard = memo(function ProgressCard({
  config,
}: ProgressCardProps) {
  const progressPercent = Math.min(100, Math.max(0, config.progress));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 p-4 shadow-sm"
    >
      {/* Title and status */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-800">
          {config.title}
        </h4>
        <span className={`
          text-xs px-2 py-0.5 rounded-full font-medium
          ${progressPercent === 100
            ? 'bg-green-100 text-green-700'
            : 'bg-blue-100 text-blue-700'
          }
        `}>
          {config.status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`
            absolute inset-y-0 left-0 rounded-full
            ${progressPercent === 100
              ? 'bg-gradient-to-r from-green-500 to-emerald-500'
              : 'bg-gradient-to-r from-violet-500 to-purple-500'
            }
          `}
        />
      </div>

      {/* Progress percentage */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
        <span>Progress</span>
        <span className="font-medium text-slate-700">{progressPercent}%</span>
      </div>

      {/* Steps list */}
      {config.steps && config.steps.length > 0 && (
        <div className="space-y-2">
          {config.steps.map((step, index) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-2"
            >
              {/* Step indicator */}
              <div className={`
                w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                ${step.completed
                  ? 'bg-green-500'
                  : index === config.steps!.findIndex(s => !s.completed)
                    ? 'bg-violet-500'
                    : 'bg-slate-200'
                }
              `}>
                {step.completed ? (
                  <Check className="w-3 h-3 text-white" />
                ) : index === config.steps!.findIndex(s => !s.completed) ? (
                  <Loader2 className="w-3 h-3 text-white animate-spin" />
                ) : (
                  <Circle className="w-2 h-2 text-slate-400" />
                )}
              </div>

              {/* Step label */}
              <span className={`
                text-sm
                ${step.completed
                  ? 'text-slate-600 line-through'
                  : index === config.steps!.findIndex(s => !s.completed)
                    ? 'text-slate-800 font-medium'
                    : 'text-slate-400'
                }
              `}>
                {step.label}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
});

export default ProgressCard;
