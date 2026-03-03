'use client';

/**
 * SummaryCard
 *
 * Summary card interactive component - Displays task completion statistics
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SummaryCardComponent, StatItem, ButtonConfig } from '../../types';

interface SummaryCardProps {
  config: SummaryCardComponent;
  onAction: (actionId: string) => void;
}

const TrendIcon = ({ trend }: { trend?: StatItem['trend'] }) => {
  const iconClass = 'w-3 h-3';
  switch (trend) {
    case 'up':
      return <TrendingUp className={`${iconClass} text-green-500`} />;
    case 'down':
      return <TrendingDown className={`${iconClass} text-red-500`} />;
    case 'neutral':
      return <Minus className={`${iconClass} text-slate-400`} />;
    default:
      return null;
  }
};

const buttonVariants: Record<ButtonConfig['variant'], string> = {
  primary: 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-500 text-white hover:bg-red-600',
};

export const SummaryCard = memo(function SummaryCard({
  config,
  onAction,
}: SummaryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-violet-50 via-white to-purple-50 rounded-xl border border-violet-200/50 p-4 shadow-sm"
    >
      {/* Title */}
      {config.title && (
        <h4 className="text-sm font-semibold text-slate-800 mb-4">
          {config.title}
        </h4>
      )}

      {/* Statistics grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {config.stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white rounded-lg p-3 border border-slate-100 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-1">
              {stat.icon && (
                <span className="text-base">{stat.icon}</span>
              )}
              <span className="text-xs text-slate-500 truncate">
                {stat.label}
              </span>
              {stat.trend && <TrendIcon trend={stat.trend} />}
            </div>
            <div className="text-xl font-bold text-slate-900">
              {stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Action buttons */}
      {config.actions && config.actions.length > 0 && (
        <div className="flex gap-2">
          {config.actions.map((action, index) => (
            <motion.button
              key={action.id}
              type="button"
              onClick={() => onAction(action.id)}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`
                flex-1 px-3 py-2 rounded-lg text-sm font-medium
                transition-all duration-200
                ${buttonVariants[action.variant]}
              `}
            >
              {action.icon && <span className="mr-1">{action.icon}</span>}
              {action.label}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
});

export default SummaryCard;
