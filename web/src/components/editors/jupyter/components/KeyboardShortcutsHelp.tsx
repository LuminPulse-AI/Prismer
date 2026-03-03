'use client';

/**
 * KeyboardShortcutsHelp - Keyboard Shortcuts Help Dialog
 */

import React, { memo } from 'react';
import { X, Keyboard } from 'lucide-react';
import { 
  type KeyboardShortcut, 
  getShortcutsByCategory, 
  formatShortcutKey 
} from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcut[];
}

const CATEGORY_LABELS: Record<string, string> = {
  cell: 'Cell Operations',
  execution: 'Execution',
  navigation: 'Navigation',
  edit: 'Editing',
  misc: 'Other',
};

export const KeyboardShortcutsHelp = memo(function KeyboardShortcutsHelp({
  isOpen,
  onClose,
  shortcuts,
}: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null;

  const categories = getShortcutsByCategory(shortcuts);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-blue-400" />
            <h2 className="text-white font-medium">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Info */}
        <div className="px-4 py-2 bg-slate-800/30 border-b border-slate-700 text-sm text-slate-400">
          <span className="text-blue-400">Command Mode</span>: Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs">Esc</kbd> to enter.
          <span className="mx-2">|</span>
          <span className="text-green-400">Edit Mode</span>: Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs">Enter</kbd> on a cell to enter.
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-6">
            {Object.entries(categories).map(([category, categoryShortcuts]) => {
              if (categoryShortcuts.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-sm font-medium text-slate-300 mb-2">
                    {CATEGORY_LABELS[category] || category}
                  </h3>
                  <div className="space-y-1">
                    {categoryShortcuts.map((shortcut, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm text-slate-400">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.mode && shortcut.mode !== 'any' && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              shortcut.mode === 'command' 
                                ? 'bg-blue-900/30 text-blue-400' 
                                : 'bg-green-900/30 text-green-400'
                            }`}>
                              {shortcut.mode}
                            </span>
                          )}
                          <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 font-mono">
                            {formatShortcutKey(shortcut)}
                          </kbd>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30 text-center">
          <span className="text-xs text-slate-500">
            Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs">H</kbd> in command mode to show this help
          </span>
        </div>
      </div>
    </div>
  );
});

export default KeyboardShortcutsHelp;
