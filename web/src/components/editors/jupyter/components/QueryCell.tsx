'use client';

/**
 * QueryCell - User Query Input Component
 *
 * Used to send questions or instructions to the Agent
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';

interface QueryCellProps {
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function QueryCell({ 
  onSubmit, 
  isLoading = false, 
  placeholder = "Ask a question or describe what you want to do...",
  disabled = false,
}: QueryCellProps) {
  const [query, setQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-adjust height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [query]);

  const handleSubmit = useCallback(() => {
    if (!query.trim() || isLoading || disabled) return;
    onSubmit(query.trim());
    setQuery('');
  }, [query, isLoading, disabled, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-200">
        <Sparkles size={14} className="text-indigo-600" />
        <span className="text-xs text-indigo-600 font-medium">Ask AI Assistant</span>
      </div>

      {/* Input Area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          rows={1}
          className="w-full px-4 py-3 bg-white/80 text-slate-800 placeholder-slate-500 resize-none focus:outline-none disabled:opacity-50 border-0"
          style={{ minHeight: '44px' }}
        />
        
        {/* Submit Button */}
        <div className="absolute right-2 bottom-2">
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || isLoading || disabled}
            className={`p-2 rounded-lg transition-colors ${
              query.trim() && !isLoading && !disabled
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }`}
            title="Send (Enter)"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-indigo-100 flex-wrap">
        <span className="text-xs text-slate-600 font-medium">Quick:</span>
        <QuickActionButton onClick={() => setQuery('Explain the output above')}>
          Explain output
        </QuickActionButton>
        <QuickActionButton onClick={() => setQuery('Fix the error in the code')}>
          Fix error
        </QuickActionButton>
        <QuickActionButton onClick={() => setQuery('Visualize the data')}>
          Visualize
        </QuickActionButton>
      </div>
    </div>
  );
}

function QuickActionButton({ 
  onClick, 
  children 
}: { 
  onClick: () => void; 
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded transition-colors"
    >
      {children}
    </button>
  );
}

export default QueryCell;
