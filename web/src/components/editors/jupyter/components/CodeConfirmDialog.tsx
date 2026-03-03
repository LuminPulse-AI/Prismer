'use client';

/**
 * CodeConfirmDialog - Code Execution Confirmation Dialog
 *
 * Used in interactive mode to confirm whether to execute Agent-generated code.
 * Supports code diff display and security warnings.
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Play, 
  Code2, 
  AlertTriangle, 
  Check,
  Copy,
  Edit3,
} from 'lucide-react';
import Editor from '@monaco-editor/react';

interface CodeConfirmDialogProps {
  isOpen: boolean;
  code: string;
  originalCode?: string; // If this is an update operation, show diff
  warnings?: string[];
  description?: string;
  onConfirm: (code: string) => void;
  onCancel: () => void;
  onInsert?: (code: string) => void;
}

export function CodeConfirmDialog({
  isOpen,
  code: initialCode,
  originalCode,
  warnings = [],
  description,
  onConfirm,
  onCancel,
  onInsert,
}: CodeConfirmDialogProps) {
  const [code, setCode] = useState(initialCode);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Update code when prop changes
  useEffect(() => {
    setCode(initialCode);
    setIsEditing(false);
  }, [initialCode]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = () => {
    onConfirm(code);
  };

  const hasWarnings = warnings.length > 0;
  const isUpdate = !!originalCode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-blue-400" />
            <h2 className="text-white font-medium">
              {isUpdate ? 'Confirm Code Update' : 'Confirm Code Execution'}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        {description && (
          <div className="px-4 py-2 bg-blue-900/20 border-b border-slate-700 text-sm text-blue-300">
            {description}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="px-4 py-2 bg-yellow-900/20 border-b border-slate-700">
            <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium mb-1">
              <AlertTriangle size={14} />
              <span>Security Warnings</span>
            </div>
            <ul className="text-xs text-yellow-400/80 ml-5 list-disc">
              {warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Code Editor */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isUpdate && originalCode ? (
            // Diff View
            <div className="h-full flex">
              <div className="flex-1 border-r border-slate-700">
                <div className="px-3 py-1 bg-slate-800/50 text-xs text-slate-500 border-b border-slate-700">
                  Original
                </div>
                <Editor
                  height="calc(100% - 28px)"
                  language="python"
                  value={originalCode}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
              <div className="flex-1">
                <div className="px-3 py-1 bg-slate-800/50 text-xs text-slate-500 border-b border-slate-700">
                  Updated
                </div>
                <Editor
                  height="calc(100% - 28px)"
                  language="python"
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  theme="vs-dark"
                  options={{
                    readOnly: !isEditing,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </div>
          ) : (
            // Single Code View
            <Editor
              height="100%"
              language="python"
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                readOnly: !isEditing,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 },
              }}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-800/30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors ${
                isEditing 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Edit3 size={14} />
              {isEditing ? 'Editing' : 'Edit'}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-700 text-slate-300 hover:bg-slate-600 rounded transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 text-sm bg-slate-700 text-slate-300 hover:bg-slate-600 rounded transition-colors"
            >
              Cancel
            </button>
            {onInsert && (
              <button
                onClick={() => onInsert(code)}
                className="flex items-center gap-1 px-4 py-1.5 text-sm bg-slate-600 text-white hover:bg-slate-500 rounded transition-colors"
              >
                <Code2 size={14} />
                Insert Only
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`flex items-center gap-1 px-4 py-1.5 text-sm rounded transition-colors ${
                hasWarnings
                  ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              <Play size={14} />
              {hasWarnings ? 'Run Anyway' : 'Run Code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeConfirmDialog;
