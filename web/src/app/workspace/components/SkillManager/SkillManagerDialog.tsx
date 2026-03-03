'use client';

/**
 * SkillManagerDialog - Unified Skill Management Dialog
 *
 * Visual spec:
 * - Consistent with ChatPanel's white background + rounded card style
 * - Mobile adaptation: Full-screen mode, bottom drawer animation
 * - Desktop: Centered dialog
 */

import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Package, X, Loader2, AlertCircle, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSkillStore,
  useFilteredSkills,
  useSkillLoading,
  useSkillActions,
  useSkillFilters,
  useInstalledSkills,
  type SkillCategory,
} from '@/store/skillStore';
import { SkillCard } from './SkillCard';
import { SkillDetails } from './SkillDetails';

interface SkillManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedded?: boolean;
  /** When set, skills are fetched and install/uninstall target this agent (unified with Manage Workspaces) */
  agentId?: string | null;
  /** When set (and no agentId), install/uninstall target this workspace's agent */
  workspaceId?: string | null;
}

const categoryLabels: Record<SkillCategory, string> = {
  latex: 'LaTeX',
  jupyter: 'Jupyter',
  pdf: 'PDF',
  citation: 'Citation',
  data: 'Data',
  writing: 'Writing',
  general: 'General',
};

// Detect if on mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

export function SkillManagerDialog({
  open,
  onOpenChange,
  embedded = false,
  agentId: agentIdProp,
  workspaceId: workspaceIdProp,
}: SkillManagerDialogProps) {
  const isMobile = useIsMobile();
  const skills = useFilteredSkills();
  const installedSkills = useInstalledSkills();
  const selectedSkill = useSkillStore((state) => state.selectedSkill);
  const { isLoading, isInstalling, error } = useSkillLoading();
  const { selectedCategory, categories } = useSkillFilters();
  const {
    fetchSkills,
    fetchSkillDetails,
    installSkill,
    uninstallSkill,
    setSearchQuery,
    setSelectedCategory,
    clearSelection,
    clearError,
  } = useSkillActions();

  // Resolve agent context: explicit agentId (e.g. from Manage Workspaces) or we use workspaceId later for install
  const contextAgentId = agentIdProp ?? undefined;

  // Local search state
  const [localSearch, setLocalSearch] = useState('');

  const isOpen = embedded ? true : open;

  // Fetch skills on open (agentId or workspaceId so installed state matches this agent)
  useEffect(() => {
    if (isOpen) {
      fetchSkills({
        agentId: contextAgentId,
        workspaceId: workspaceIdProp ?? undefined,
      });
    }
  }, [isOpen, fetchSkills, contextAgentId, workspaceIdProp]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery]);

  // Clear selection on close
  useEffect(() => {
    if (!isOpen) {
      clearSelection();
      clearError();
    }
  }, [isOpen, clearSelection, clearError]);

  const handleCategoryClick = useCallback(
    (category: SkillCategory) => {
      setSelectedCategory(selectedCategory === category ? null : category);
    },
    [selectedCategory, setSelectedCategory]
  );

  const handleSkillSelect = useCallback(
    (id: string) => {
      fetchSkillDetails(id);
    },
    [fetchSkillDetails]
  );

  const handleInstall = useCallback(
    async (id: string) => {
      await installSkill(id, workspaceIdProp ?? undefined, contextAgentId);
    },
    [installSkill, workspaceIdProp, contextAgentId]
  );

  const handleUninstall = useCallback(
    async (id: string) => {
      await uninstallSkill(id, contextAgentId, workspaceIdProp ?? undefined);
      clearSelection();
    },
    [uninstallSkill, clearSelection, contextAgentId, workspaceIdProp]
  );

  const handleClose = useCallback(() => {
    if (!embedded) {
      onOpenChange(false);
    }
  }, [embedded, onOpenChange]);

  const handleBack = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Split skills
  const availableSkills = skills.filter((s) => !s.installed);

  if (!isOpen) return null;

  // Mobile detail view
  if (!embedded && isMobile && selectedSkill) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-white"
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="h-full flex flex-col"
        >
          {/* Mobile Detail Header */}
          <header className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-lg border-b border-slate-200/50 safe-area-top">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-slate-600" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900 flex-1">{selectedSkill.name}</h1>
          </header>

          <SkillDetails
            skill={selectedSkill}
            onClose={handleBack}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            isInstalling={isInstalling}
            isMobile
          />
        </motion.div>
      </motion.div>
    );
  }

  // Mobile main list view
  if (!embedded && isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-50"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="h-full flex flex-col bg-white"
        >
          {/* Mobile Header */}
          <header className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-lg border-b border-slate-200/50 safe-area-top">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Skills</h1>
                <p className="text-xs text-slate-500">{skills.length} available</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 -mr-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors"
            >
              <X className="w-6 h-6 text-slate-600" />
            </button>
          </header>

          {/* Search */}
          <div className="px-4 py-3 bg-white border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search skills..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            {/* Category Pills */}
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryClick(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all',
                    selectedCategory === cat
                      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {categoryLabels[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-4 mt-3 p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700 flex-1">{error}</span>
                <button onClick={clearError} className="p-1 hover:bg-red-100 rounded-lg">
                  <X className="w-4 h-4 text-red-500" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Skills List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              </div>
            ) : (
              <div className="p-4 space-y-6">
                {/* Installed */}
                {installedSkills.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      Installed · {installedSkills.length}
                    </h2>
                    <div className="space-y-2">
                      {installedSkills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          onSelect={handleSkillSelect}
                          onUninstall={handleUninstall}
                          isInstalling={isInstalling}
                          isMobile
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Available */}
                {availableSkills.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      Available · {availableSkills.length}
                    </h2>
                    <div className="space-y-2">
                      {availableSkills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          onSelect={handleSkillSelect}
                          onInstall={handleInstall}
                          isInstalling={isInstalling}
                          isMobile
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Empty */}
                {skills.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Package className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg font-medium">No skills found</p>
                    {localSearch && <p className="text-sm mt-1">Try a different search</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (embedded) {
    return (
      <div className="h-full min-h-[420px] flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Skill Manager</h2>
              <p className="text-sm text-slate-500">{skills.length} skills available</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-4 space-y-3 bg-slate-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleCategoryClick(cat)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      selectedCategory === cat
                        ? 'bg-violet-500 text-white shadow-md shadow-violet-500/25'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:text-violet-600'
                    )}
                  >
                    {categoryLabels[cat]}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mx-4 mt-2 p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm text-red-700 flex-1">{error}</span>
                  <button onClick={clearError} className="p-1 hover:bg-red-100 rounded-lg">
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
              ) : (
                <div className="space-y-6">
                  {installedSkills.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Installed · {installedSkills.length}
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {installedSkills.map((skill) => (
                          <SkillCard
                            key={skill.id}
                            skill={skill}
                            onSelect={handleSkillSelect}
                            onUninstall={handleUninstall}
                            isInstalling={isInstalling}
                            compact
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {availableSkills.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Available · {availableSkills.length}
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {availableSkills.map((skill) => (
                          <SkillCard
                            key={skill.id}
                            skill={skill}
                            onSelect={handleSkillSelect}
                            onInstall={handleInstall}
                            isInstalling={isInstalling}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {skills.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <Package className="w-16 h-16 mb-4 opacity-50" />
                      <p className="text-lg font-medium">No skills found</p>
                      {localSearch && <p className="text-sm mt-1">Try a different search</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {selectedSkill && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="border-l border-slate-100 bg-slate-50/50 overflow-hidden"
              >
                <SkillDetails
                  skill={selectedSkill}
                  onClose={clearSelection}
                  onInstall={handleInstall}
                  onUninstall={handleUninstall}
                  isInstalling={isInstalling}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // Desktop
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[900px] md:max-h-[80vh] z-50 flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Skill Manager</h2>
                  <p className="text-sm text-slate-500">{skills.length} skills available</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* Main content */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Search and filters */}
                <div className="p-4 space-y-3 bg-slate-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search skills..."
                      value={localSearch}
                      onChange={(e) => setLocalSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                    />
                  </div>

                  {/* Category filters */}
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => handleCategoryClick(cat)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                          selectedCategory === cat
                            ? 'bg-violet-500 text-white shadow-md shadow-violet-500/25'
                            : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:text-violet-600'
                        )}
                      >
                        {categoryLabels[cat]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mx-4 mt-2 p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="text-sm text-red-700 flex-1">{error}</span>
                      <button onClick={clearError} className="p-1 hover:bg-red-100 rounded-lg">
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Skills list */}
                <div className="flex-1 overflow-y-auto p-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Installed */}
                      {installedSkills.length > 0 && (
                        <section>
                          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Installed · {installedSkills.length}
                          </h3>
                          <div className="grid grid-cols-2 gap-3">
                            {installedSkills.map((skill) => (
                              <SkillCard
                                key={skill.id}
                                skill={skill}
                                onSelect={handleSkillSelect}
                                onUninstall={handleUninstall}
                                isInstalling={isInstalling}
                                compact
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Available */}
                      {availableSkills.length > 0 && (
                        <section>
                          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Available · {availableSkills.length}
                          </h3>
                          <div className="grid grid-cols-2 gap-3">
                            {availableSkills.map((skill) => (
                              <SkillCard
                                key={skill.id}
                                skill={skill}
                                onSelect={handleSkillSelect}
                                onInstall={handleInstall}
                                isInstalling={isInstalling}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Empty */}
                      {skills.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                          <Package className="w-16 h-16 mb-4 opacity-50" />
                          <p className="text-lg font-medium">No skills found</p>
                          {localSearch && <p className="text-sm mt-1">Try a different search</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop detail sidebar */}
              <AnimatePresence>
                {selectedSkill && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 320, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="border-l border-slate-100 bg-slate-50/50 overflow-hidden"
                  >
                    <SkillDetails
                      skill={selectedSkill}
                      onClose={clearSelection}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      isInstalling={isInstalling}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
