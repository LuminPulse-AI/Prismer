'use client';

/**
 * SkillDetails - Skill Details Component
 *
 * Visual spec:
 * - White/light theme consistent with ChatPanel
 * - Mobile: Full-screen scrollable view
 * - Desktop: Fixed-width sidebar
 */

import { motion } from 'framer-motion';
import { Package, X, Download, Trash2, ExternalLink, Wrench, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkillDetails as SkillDetailsType } from '@/store/skillStore';

interface SkillDetailsProps {
  skill: SkillDetailsType;
  onClose: () => void;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  isInstalling?: boolean;
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

export function SkillDetails({
  skill,
  onClose,
  onInstall,
  onUninstall,
  isInstalling,
  isMobile,
}: SkillDetailsProps) {
  const colors = categoryColors[skill.category] || categoryColors.general;

  // Mobile full-screen view
  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col bg-white">
        {/* Hero section */}
        <div className="p-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-white shadow-lg flex items-center justify-center">
              <Package className="w-8 h-8 text-slate-500" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900">{skill.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md text-xs font-medium',
                    colors.bg,
                    colors.text
                  )}
                >
                  {skill.category}
                </span>
                <span className="text-sm text-slate-400">v{skill.version}</span>
                {skill.installed && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <Check className="w-3 h-3" />
                    Installed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Description */}
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Description
              </h2>
              <p className="text-slate-700 leading-relaxed">{skill.description}</p>
            </section>

            {/* Tools */}
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                Tools ({skill.tools.length})
              </h2>
              <div className="space-y-2">
                {skill.tools.map((tool) => (
                  <div
                    key={typeof tool === 'string' ? tool : tool.name}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <code className="text-sm font-mono text-violet-600">
                      {typeof tool === 'string' ? tool : tool.name}
                    </code>
                    {typeof tool === 'object' && tool.description && (
                      <p className="text-sm text-slate-500 mt-1">{tool.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Dependencies */}
            {skill.dependencies && skill.dependencies.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Dependencies
                </h2>
                <div className="flex flex-wrap gap-2">
                  {skill.dependencies.map((dep) => (
                    <span
                      key={dep}
                      className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 text-sm"
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Metadata */}
            <section className="space-y-3">
              {skill.author && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Author</span>
                  <span className="text-sm text-slate-900">{skill.author}</span>
                </div>
              )}
              {skill.repository && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Repository</span>
                  <a
                    href={skill.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-violet-600 flex items-center gap-1"
                  >
                    View
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Action button */}
        <div className="p-4 border-t border-slate-100 bg-white safe-area-bottom">
          {skill.installed ? (
            skill.builtin ? (
              <div className="py-3 text-center text-slate-400 text-sm">
                Built-in skill cannot be modified
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => onUninstall(skill.id)}
                disabled={isInstalling}
                className="w-full py-3.5 rounded-xl bg-red-50 text-red-600 font-semibold flex items-center justify-center gap-2 active:bg-red-100 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                Uninstall
              </motion.button>
            )
          ) : (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => onInstall(skill.id)}
              disabled={isInstalling}
              className="w-full py-3.5 rounded-xl bg-violet-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 active:bg-violet-600 transition-colors"
            >
              <Download className="w-5 h-5" />
              Install Skill
            </motion.button>
          )}
        </div>
      </div>
    );
  }

  // Desktop sidebar
  return (
    <div className="w-80 h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-white shadow flex items-center justify-center">
              <Package className="w-6 h-6 text-slate-500" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{skill.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400">v{skill.version}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-xs font-medium',
                    colors.bg,
                    colors.text
                  )}
                >
                  {skill.category}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Description */}
        <section>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Description
          </h4>
          <p className="text-sm text-slate-600 leading-relaxed">{skill.description}</p>
        </section>

        {/* Tools */}
        <section>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wrench className="w-3 h-3" />
            Tools ({skill.tools.length})
          </h4>
          <div className="space-y-1.5">
            {skill.tools.map((tool) => (
              <div
                key={typeof tool === 'string' ? tool : tool.name}
                className="p-2 rounded-lg bg-slate-50 border border-slate-100"
              >
                <code className="text-xs font-mono text-violet-600">
                  {typeof tool === 'string' ? tool : tool.name}
                </code>
                {typeof tool === 'object' && tool.description && (
                  <p className="text-xs text-slate-400 mt-0.5">{tool.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Dependencies */}
        {skill.dependencies && skill.dependencies.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Dependencies
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {skill.dependencies.map((dep) => (
                <span
                  key={dep}
                  className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs"
                >
                  {dep}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Metadata */}
        <section className="space-y-2 pt-2 border-t border-slate-100">
          {skill.author && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Author</span>
              <span className="text-slate-700">{skill.author}</span>
            </div>
          )}
          {skill.repository && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Repository</span>
              <a
                href={skill.repository}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 hover:text-violet-700 flex items-center gap-1"
              >
                View
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </section>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-slate-100">
        {skill.installed ? (
          skill.builtin ? (
            <div className="py-2 text-center text-slate-400 text-sm">
              Built-in skill
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onUninstall(skill.id)}
              disabled={isInstalling}
              className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 font-medium flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Uninstall
            </motion.button>
          )
        ) : (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onInstall(skill.id)}
            disabled={isInstalling}
            className="w-full py-2.5 rounded-xl bg-violet-500 text-white font-medium flex items-center justify-center gap-2 hover:bg-violet-600 shadow-md shadow-violet-500/25 transition-colors"
          >
            <Download className="w-4 h-4" />
            Install Skill
          </motion.button>
        )}
      </div>
    </div>
  );
}
