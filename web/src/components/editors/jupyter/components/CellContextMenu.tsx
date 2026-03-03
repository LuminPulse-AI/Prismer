'use client';

/**
 * CellContextMenu - Cell Context Menu and AI Action Buttons
 *
 * Features:
 * - Context menu (copy/paste/delete/move)
 * - AI actions (Explain/Fix/Optimize)
 */

import React, { memo, useState, useCallback } from 'react';
import {
  Sparkles,
  MessageSquare,
  Wrench,
  Zap,
  FileText,
  Copy,
  Scissors,
  Clipboard,
  Trash2,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Code2,
  Play,
  X,
} from 'lucide-react';
import type { CodeCell } from '../types';

// ============================================================
// Type Definitions
// ============================================================

export type CellAIAction = 'explain' | 'fix' | 'optimize' | 'document' | 'ask';

interface CellContextMenuProps {
  cell: CodeCell;
  isFirst: boolean;
  isLast: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onAIAction: (action: CellAIAction) => void;
}

interface CellAIToolbarProps {
  cell: CodeCell;
  onAction: (action: CellAIAction) => void;
  className?: string;
}

// ============================================================
// CellAIToolbar Component
// ============================================================

export const CellAIToolbar = memo(function CellAIToolbar({
  cell,
  onAction,
  className = '',
}: CellAIToolbarProps) {
  const [showMenu, setShowMenu] = useState(false);

  const hasError = cell.executionState === 'error';
  const hasOutput = cell.outputs.length > 0;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Quick Actions */}
      <button
        onClick={() => onAction('explain')}
        className="p-1 text-stone-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
        title="Explain this code"
      >
        <MessageSquare size={14} />
      </button>

      {hasError && (
        <button
          onClick={() => onAction('fix')}
          className="p-1 text-red-600 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Fix this error"
        >
          <Wrench size={14} />
        </button>
      )}

      {/* More Menu */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 text-stone-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
          title="AI Actions"
        >
          <Sparkles size={14} />
        </button>

        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
              <div className="py-1">
                <AIActionButton
                  icon={<MessageSquare size={14} />}
                  label="Explain Code"
                  description="Get an explanation"
                  onClick={() => {
                    onAction('explain');
                    setShowMenu(false);
                  }}
                />
                <AIActionButton
                  icon={<Wrench size={14} />}
                  label="Fix Issues"
                  description="Debug and fix errors"
                  onClick={() => {
                    onAction('fix');
                    setShowMenu(false);
                  }}
                  highlight={hasError}
                />
                <AIActionButton
                  icon={<Zap size={14} />}
                  label="Optimize"
                  description="Improve performance"
                  onClick={() => {
                    onAction('optimize');
                    setShowMenu(false);
                  }}
                />
                <AIActionButton
                  icon={<FileText size={14} />}
                  label="Add Documentation"
                  description="Generate docstrings"
                  onClick={() => {
                    onAction('document');
                    setShowMenu(false);
                  }}
                />
                <div className="border-t border-stone-200 my-1" />
                <AIActionButton
                  icon={<MessageSquare size={14} />}
                  label="Ask About This"
                  description="Custom question"
                  onClick={() => {
                    onAction('ask');
                    setShowMenu(false);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// ============================================================
// AIActionButton Component
// ============================================================

interface AIActionButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  highlight?: boolean;
}

const AIActionButton = memo(function AIActionButton({
  icon,
  label,
  description,
  onClick,
  highlight = false,
}: AIActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-2 px-3 py-2 hover:bg-stone-100 transition-colors ${
        highlight ? 'bg-red-50' : ''
      }`}
    >
      <span className={`mt-0.5 ${highlight ? 'text-red-600' : 'text-indigo-600'}`}>
        {icon}
      </span>
      <div className="text-left">
        <div className="text-sm text-stone-700">{label}</div>
        <div className="text-xs text-stone-500">{description}</div>
      </div>
    </button>
  );
});

// ============================================================
// CellContextMenu Component
// ============================================================

export const CellContextMenu = memo(function CellContextMenu({
  cell,
  isFirst,
  isLast,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onAIAction,
}: CellContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 rounded"
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
            <div className="py-1">
              {/* Edit Actions */}
              <MenuSection title="Edit">
                <MenuItem
                  icon={<Copy size={14} />}
                  label="Copy"
                  shortcut="⌘C"
                  onClick={() => {
                    onCopy();
                    setIsOpen(false);
                  }}
                />
                <MenuItem
                  icon={<Scissors size={14} />}
                  label="Cut"
                  shortcut="⌘X"
                  onClick={() => {
                    onCut();
                    setIsOpen(false);
                  }}
                />
                <MenuItem
                  icon={<Clipboard size={14} />}
                  label="Paste Below"
                  shortcut="⌘V"
                  onClick={() => {
                    onPaste();
                    setIsOpen(false);
                  }}
                />
                <MenuItem
                  icon={<Code2 size={14} />}
                  label="Duplicate"
                  onClick={() => {
                    onDuplicate();
                    setIsOpen(false);
                  }}
                />
              </MenuSection>

              {/* Position Actions */}
              <MenuSection title="Position">
                <MenuItem
                  icon={<ChevronUp size={14} />}
                  label="Move Up"
                  disabled={isFirst}
                  onClick={() => {
                    onMoveUp();
                    setIsOpen(false);
                  }}
                />
                <MenuItem
                  icon={<ChevronDown size={14} />}
                  label="Move Down"
                  disabled={isLast}
                  onClick={() => {
                    onMoveDown();
                    setIsOpen(false);
                  }}
                />
              </MenuSection>

              {/* AI Actions */}
              <MenuSection title="AI">
                <MenuItem
                  icon={<MessageSquare size={14} />}
                  label="Explain"
                  iconColor="text-indigo-600"
                  onClick={() => {
                    onAIAction('explain');
                    setIsOpen(false);
                  }}
                />
                <MenuItem
                  icon={<Wrench size={14} />}
                  label="Fix"
                  iconColor="text-indigo-600"
                  onClick={() => {
                    onAIAction('fix');
                    setIsOpen(false);
                  }}
                />
                <MenuItem
                  icon={<Zap size={14} />}
                  label="Optimize"
                  iconColor="text-indigo-600"
                  onClick={() => {
                    onAIAction('optimize');
                    setIsOpen(false);
                  }}
                />
              </MenuSection>

              {/* Danger Zone */}
              <div className="border-t border-stone-200 mt-1 pt-1">
                <MenuItem
                  icon={<Trash2 size={14} />}
                  label="Delete"
                  shortcut="⌘⌫"
                  danger
                  onClick={() => {
                    onDelete();
                    setIsOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================
// MenuSection Component
// ============================================================

interface MenuSectionProps {
  title: string;
  children: React.ReactNode;
}

const MenuSection = memo(function MenuSection({
  title,
  children,
}: MenuSectionProps) {
  return (
    <div className="border-t border-stone-200 first:border-t-0">
      <div className="px-3 py-1 text-xs text-stone-500 font-medium">{title}</div>
      {children}
    </div>
  );
});

// ============================================================
// MenuItem Component
// ============================================================

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  iconColor?: string;
  onClick: () => void;
}

const MenuItem = memo(function MenuItem({
  icon,
  label,
  shortcut,
  disabled = false,
  danger = false,
  iconColor,
  onClick,
}: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
        disabled
          ? 'text-stone-400 cursor-not-allowed'
          : danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-stone-700 hover:bg-stone-100'
      }`}
    >
      <span className={iconColor || (danger ? 'text-red-600' : 'text-stone-500')}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-xs text-stone-400">{shortcut}</span>
      )}
    </button>
  );
});

export default CellContextMenu;
