/**
 * useKeyboardShortcuts - Keyboard Shortcuts Hook
 *
 * Provides Jupyter Notebook-style keyboard shortcut support.
 */

import { useEffect, useCallback, useRef } from 'react';

// ============================================================
// Type Definitions
// ============================================================

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;  // Command on Mac
  action: () => void;
  description: string;
  category?: 'cell' | 'execution' | 'navigation' | 'edit' | 'misc';
  mode?: 'command' | 'edit' | 'any';  // Jupyter mode
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  mode?: 'command' | 'edit';
  onModeChange?: (mode: 'command' | 'edit') => void;
}

export interface NotebookActions {
  // Cell operations
  addCellAbove?: () => void;
  addCellBelow?: () => void;
  deleteCell?: () => void;
  cutCell?: () => void;
  copyCell?: () => void;
  pasteCell?: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
  
  // Execution operations
  runCell?: () => void;
  runCellAndAdvance?: () => void;
  runAllCells?: () => void;
  interruptKernel?: () => void;
  restartKernel?: () => void;
  
  // Navigation
  selectPrevCell?: () => void;
  selectNextCell?: () => void;
  
  // Edit
  enterEditMode?: () => void;
  enterCommandMode?: () => void;
  undo?: () => void;
  redo?: () => void;
  
  // Misc
  save?: () => void;
  toggleLineNumbers?: () => void;
  showKeyboardShortcuts?: () => void;
}

// ============================================================
// Default Shortcut Configuration
// ============================================================

function createDefaultShortcuts(actions: NotebookActions): KeyboardShortcut[] {
  const shortcuts: KeyboardShortcut[] = [];

  // === Cell Operations (Command Mode) ===
  if (actions.addCellAbove) {
    shortcuts.push({
      key: 'a',
      action: actions.addCellAbove,
      description: 'Add cell above',
      category: 'cell',
      mode: 'command',
    });
  }

  if (actions.addCellBelow) {
    shortcuts.push({
      key: 'b',
      action: actions.addCellBelow,
      description: 'Add cell below',
      category: 'cell',
      mode: 'command',
    });
  }

  if (actions.deleteCell) {
    shortcuts.push({
      key: 'd',
      action: () => {
        // Requires pressing d twice
      },
      description: 'Delete cell (press twice)',
      category: 'cell',
      mode: 'command',
    });

    shortcuts.push({
      key: 'x',
      action: actions.deleteCell,
      description: 'Cut cell',
      category: 'cell',
      mode: 'command',
    });
  }

  if (actions.copyCell) {
    shortcuts.push({
      key: 'c',
      action: actions.copyCell,
      description: 'Copy cell',
      category: 'cell',
      mode: 'command',
    });
  }

  if (actions.pasteCell) {
    shortcuts.push({
      key: 'v',
      action: actions.pasteCell,
      description: 'Paste cell below',
      category: 'cell',
      mode: 'command',
    });

    shortcuts.push({
      key: 'v',
      shift: true,
      action: actions.pasteCell,
      description: 'Paste cell above',
      category: 'cell',
      mode: 'command',
    });
  }

  if (actions.moveUp) {
    shortcuts.push({
      key: 'ArrowUp',
      ctrl: true,
      action: actions.moveUp,
      description: 'Move cell up',
      category: 'cell',
      mode: 'command',
    });
  }

  if (actions.moveDown) {
    shortcuts.push({
      key: 'ArrowDown',
      ctrl: true,
      action: actions.moveDown,
      description: 'Move cell down',
      category: 'cell',
      mode: 'command',
    });
  }

  // === Execution Operations ===
  if (actions.runCell) {
    shortcuts.push({
      key: 'Enter',
      ctrl: true,
      action: actions.runCell,
      description: 'Run cell',
      category: 'execution',
      mode: 'any',
    });
  }

  if (actions.runCellAndAdvance) {
    shortcuts.push({
      key: 'Enter',
      shift: true,
      action: actions.runCellAndAdvance,
      description: 'Run cell and advance',
      category: 'execution',
      mode: 'any',
    });
  }

  if (actions.runAllCells) {
    shortcuts.push({
      key: 'Enter',
      ctrl: true,
      shift: true,
      action: actions.runAllCells,
      description: 'Run all cells',
      category: 'execution',
      mode: 'any',
    });
  }

  if (actions.interruptKernel) {
    shortcuts.push({
      key: 'i',
      action: actions.interruptKernel,
      description: 'Interrupt kernel (press twice)',
      category: 'execution',
      mode: 'command',
    });
  }

  if (actions.restartKernel) {
    shortcuts.push({
      key: '0',
      action: actions.restartKernel,
      description: 'Restart kernel (press twice)',
      category: 'execution',
      mode: 'command',
    });
  }

  // === Navigation ===
  if (actions.selectPrevCell) {
    shortcuts.push({
      key: 'ArrowUp',
      action: actions.selectPrevCell,
      description: 'Select previous cell',
      category: 'navigation',
      mode: 'command',
    });

    shortcuts.push({
      key: 'k',
      action: actions.selectPrevCell,
      description: 'Select previous cell',
      category: 'navigation',
      mode: 'command',
    });
  }

  if (actions.selectNextCell) {
    shortcuts.push({
      key: 'ArrowDown',
      action: actions.selectNextCell,
      description: 'Select next cell',
      category: 'navigation',
      mode: 'command',
    });

    shortcuts.push({
      key: 'j',
      action: actions.selectNextCell,
      description: 'Select next cell',
      category: 'navigation',
      mode: 'command',
    });
  }

  // === Mode Switching ===
  if (actions.enterEditMode) {
    shortcuts.push({
      key: 'Enter',
      action: actions.enterEditMode,
      description: 'Enter edit mode',
      category: 'edit',
      mode: 'command',
    });
  }

  if (actions.enterCommandMode) {
    shortcuts.push({
      key: 'Escape',
      action: actions.enterCommandMode,
      description: 'Enter command mode',
      category: 'edit',
      mode: 'edit',
    });
  }

  // === Misc ===
  if (actions.save) {
    shortcuts.push({
      key: 's',
      ctrl: true,
      action: actions.save,
      description: 'Save notebook',
      category: 'misc',
      mode: 'any',
    });

    shortcuts.push({
      key: 's',
      meta: true,
      action: actions.save,
      description: 'Save notebook (Mac)',
      category: 'misc',
      mode: 'any',
    });
  }

  if (actions.showKeyboardShortcuts) {
    shortcuts.push({
      key: 'h',
      action: actions.showKeyboardShortcuts,
      description: 'Show keyboard shortcuts',
      category: 'misc',
      mode: 'command',
    });
  }

  if (actions.toggleLineNumbers) {
    shortcuts.push({
      key: 'l',
      action: actions.toggleLineNumbers,
      description: 'Toggle line numbers',
      category: 'misc',
      mode: 'command',
    });
  }

  return shortcuts;
}

// ============================================================
// Hook Implementation
// ============================================================

export function useKeyboardShortcuts(
  actions: NotebookActions,
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, mode = 'command', onModeChange } = options;
  
  const modeRef = useRef(mode);
  const lastKeyRef = useRef<{ key: string; time: number } | null>(null);
  
  // Update mode ref
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const shortcuts = createDefaultShortcuts(actions);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore key presses in input fields (except specific shortcuts)
    const target = event.target as HTMLElement;
    const isInEditor = target.closest('.monaco-editor') !== null;
    const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    
    // If in editor, only handle edit mode and any mode shortcuts
    const currentMode = (isInEditor || isInInput) ? 'edit' : modeRef.current;

    // Find matching shortcut
    const matchedShortcut = shortcuts.find(shortcut => {
      // Check mode
      if (shortcut.mode !== 'any' && shortcut.mode !== currentMode) {
        return false;
      }

      // Check key
      if (shortcut.key.toLowerCase() !== event.key.toLowerCase()) {
        return false;
      }

      // Check modifier keys
      if (!!shortcut.ctrl !== event.ctrlKey) return false;
      if (!!shortcut.shift !== event.shiftKey) return false;
      if (!!shortcut.alt !== event.altKey) return false;
      if (!!shortcut.meta !== event.metaKey) return false;

      return true;
    });

    if (matchedShortcut) {
      // Handle shortcuts that require pressing twice
      const now = Date.now();
      if (matchedShortcut.description.includes('press twice')) {
        if (
          lastKeyRef.current?.key === event.key &&
          now - lastKeyRef.current.time < 500
        ) {
          event.preventDefault();
          matchedShortcut.action();
          lastKeyRef.current = null;
        } else {
          lastKeyRef.current = { key: event.key, time: now };
        }
        return;
      }

      event.preventDefault();
      matchedShortcut.action();
    }
  }, [enabled, shortcuts]);

  // Register event listener
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  // Mode switching
  const setMode = useCallback((newMode: 'command' | 'edit') => {
    modeRef.current = newMode;
    onModeChange?.(newMode);
  }, [onModeChange]);

  return {
    mode: modeRef.current,
    setMode,
    shortcuts,
  };
}

// ============================================================
// Keyboard Shortcuts Help Data
// ============================================================

export function getShortcutsByCategory(shortcuts: KeyboardShortcut[]) {
  const categories: Record<string, KeyboardShortcut[]> = {
    cell: [],
    execution: [],
    navigation: [],
    edit: [],
    misc: [],
  };

  shortcuts.forEach(shortcut => {
    const category = shortcut.category || 'misc';
    if (categories[category]) {
      categories[category].push(shortcut);
    }
  });

  return categories;
}

export function formatShortcutKey(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.meta) parts.push('⌘');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  
  let key = shortcut.key;
  if (key === 'ArrowUp') key = '↑';
  if (key === 'ArrowDown') key = '↓';
  if (key === 'ArrowLeft') key = '←';
  if (key === 'ArrowRight') key = '→';
  if (key === 'Enter') key = '↵';
  if (key === 'Escape') key = 'Esc';
  
  parts.push(key.toUpperCase());
  
  return parts.join(' + ');
}

export default useKeyboardShortcuts;
