'use client';

/**
 * ChoiceCard
 *
 * Choice card interactive component - For multi-option decision making
 */

import React, { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import type { ChoiceCardComponent, ChoiceOption } from '../../types';

interface ChoiceCardProps {
  config: ChoiceCardComponent;
  onAction: (optionId: string, selectedIds?: string[]) => void;
  disabled?: boolean;
}

export const ChoiceCard = memo(function ChoiceCard({
  config,
  onAction,
  disabled = false,
}: ChoiceCardProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSelect = useCallback((option: ChoiceOption) => {
    if (disabled || option.disabled) return;

    if (config.multiSelect) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(option.id)) {
          next.delete(option.id);
        } else {
          next.add(option.id);
        }
        return next;
      });
    } else {
      // Single-select mode, trigger action directly
      onAction(option.id);
    }
  }, [config.multiSelect, disabled, onAction]);

  const handleConfirm = useCallback(() => {
    if (selectedIds.size > 0) {
      onAction('confirm', Array.from(selectedIds));
    }
  }, [selectedIds, onAction]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 p-4 shadow-sm"
    >
      {/* Title */}
      <h4 className="text-sm font-semibold text-slate-800 mb-3">
        {config.title}
      </h4>

      {/* Options list */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {config.options.map((option, index) => {
            const isSelected = selectedIds.has(option.id);
            const isHovered = hoveredId === option.id;

            return (
              <motion.button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHoveredId(option.id)}
                onMouseLeave={() => setHoveredId(null)}
                disabled={disabled || option.disabled}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={!disabled && !option.disabled ? { x: 4 } : undefined}
                className={`
                  w-full flex items-start gap-3 p-3 rounded-lg
                  text-left transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isSelected
                    ? 'bg-violet-100 border-2 border-violet-500'
                    : isHovered
                      ? 'bg-slate-100 border-2 border-slate-300'
                      : 'bg-white border-2 border-transparent hover:border-slate-200'
                  }
                `}
              >
                {/* Icon */}
                {option.icon && (
                  <span className="text-xl flex-shrink-0">
                    {option.icon}
                  </span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <span className={`
                    block text-sm font-medium
                    ${isSelected ? 'text-violet-700' : 'text-slate-800'}
                  `}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {option.description}
                    </span>
                  )}
                </div>

                {/* Check indicator */}
                {config.multiSelect && (
                  <div className={`
                    w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                    transition-all duration-200
                    ${isSelected
                      ? 'bg-violet-500'
                      : 'border-2 border-slate-300'
                    }
                  `}>
                    {isSelected && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <Check className="w-3 h-3 text-white" />
                      </motion.span>
                    )}
                  </div>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Multi-select confirm button */}
      {config.multiSelect && selectedIds.size > 0 && (
        <motion.button
          type="button"
          onClick={handleConfirm}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-4 w-full py-2.5 rounded-lg text-sm font-medium
            bg-gradient-to-r from-violet-600 to-purple-600 text-white
            hover:from-violet-700 hover:to-purple-700
            shadow-md shadow-violet-500/20 transition-all"
        >
          Confirm Selection ({selectedIds.size})
        </motion.button>
      )}
    </motion.div>
  );
});

export default ChoiceCard;
