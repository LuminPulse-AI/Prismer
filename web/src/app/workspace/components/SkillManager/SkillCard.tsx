'use client';

/**
 * SkillCard - Skill Card Component
 *
 * Visual spec:
 * - White background + rounded card
 * - Consistent with ChatPanel message card style
 * - Supports mobile and desktop
 */

import { motion } from 'framer-motion';
import { Package, Check, Download, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Skill } from '@/store/skillStore';

interface SkillCardProps {
  skill: Skill;
  onInstall?: (id: string) => void;
  onUninstall?: (id: string) => void;
  onSelect?: (id: string) => void;
  isInstalling?: boolean;
  compact?: boolean;
  isMobile?: boolean;
}

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  latex: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  jupyter: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  pdf: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  citation: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  data: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  writing: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  general: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
};

export function SkillCard({
  skill,
  onInstall,
  onUninstall,
  onSelect,
  isInstalling,
  compact,
  isMobile,
}: SkillCardProps) {
  const colors = categoryColors[skill.category] || categoryColors.general;

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (skill.installed && !skill.builtin) {
      onUninstall?.(skill.id);
    } else if (!skill.installed) {
      onInstall?.(skill.id);
    }
  };

  // Mobile card
  if (isMobile) {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => onSelect?.(skill.id)}
        className="w-full p-4 bg-white rounded-xl border border-slate-100 shadow-sm active:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 truncate">{skill.name}</h3>
              {skill.installed && (
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-600" />
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 truncate mt-0.5">{skill.description}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={cn(
                  'px-2 py-0.5 rounded-md text-xs font-medium',
                  colors.bg,
                  colors.text
                )}
              >
                {skill.category}
              </span>
              <span className="text-xs text-slate-400">v{skill.version}</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
        </div>
      </motion.button>
    );
  }

  // Desktop compact card (installed)
  if (compact) {
    return (
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => onSelect?.(skill.id)}
        className="w-full p-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all text-left flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 truncate">{skill.name}</span>
            <span className="text-xs text-slate-400">v{skill.version}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-xs', colors.text)}>{skill.category}</span>
            {skill.builtin && (
              <span className="text-xs text-slate-400">• Built-in</span>
            )}
          </div>
        </div>
        {skill.installed && (
          <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          </span>
        )}
      </motion.button>
    );
  }

  // Desktop full card (installable)
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onClick={() => onSelect?.(skill.id)}
      className="p-4 bg-white rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{skill.name}</h3>
            <span className="text-xs text-slate-400">v{skill.version}</span>
          </div>
        </div>
        <span
          className={cn(
            'px-2 py-1 rounded-lg text-xs font-medium border',
            colors.bg,
            colors.text,
            colors.border
          )}
        >
          {skill.category}
        </span>
      </div>

      {/* Description */}
      <p className="mt-3 text-sm text-slate-600 line-clamp-2">{skill.description}</p>

      {/* Tools preview */}
      {skill.tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skill.tools.slice(0, 3).map((tool) => (
            <span
              key={tool}
              className="px-2 py-0.5 text-xs rounded-md bg-slate-100 text-slate-600"
            >
              {tool}
            </span>
          ))}
          {skill.tools.length > 3 && (
            <span className="px-2 py-0.5 text-xs rounded-md bg-slate-100 text-slate-400">
              +{skill.tools.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        {skill.author && (
          <span className="text-xs text-slate-400">by {skill.author}</span>
        )}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAction}
          disabled={isInstalling || skill.builtin}
          className={cn(
            'ml-auto px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
            skill.installed
              ? skill.builtin
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-violet-500 text-white hover:bg-violet-600 shadow-md shadow-violet-500/25'
          )}
        >
          {skill.installed ? (
            skill.builtin ? (
              'Built-in'
            ) : (
              'Installed'
            )
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              Install
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
