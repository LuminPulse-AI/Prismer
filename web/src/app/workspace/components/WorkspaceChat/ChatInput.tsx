'use client';

/**
 * ChatInput
 *
 * Message input component - Supports @ mentions, # material references, / quick commands
 */

import React, { memo, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Paperclip, 
  Mic, 
  Sparkles, 
  Bot, 
  User, 
  X,
  FileText,
  Code,
  BookOpen,
  FunctionSquare,
  Hash,
} from 'lucide-react';
import type { Participant } from '../../types';

interface ChatInputProps {
  onSend: (content: string, mentions?: string[], references?: string[]) => void;
  participants?: Participant[];
  disabled?: boolean;
  placeholder?: string;
}

// Quick commands (/)
const quickCommands = [
  { id: 'search', label: 'Search papers', command: '/search ' },
  { id: 'analyze', label: 'Analyze', command: '/analyze ' },
  { id: 'write', label: 'Write', command: '/write ' },
  { id: 'summary', label: 'Summary', command: '/summary ' },
];

// Referenceable material types (#)
interface ReferenceMaterial {
  id: string;
  type: 'paper' | 'code' | 'notes' | 'latex';
  name: string;
  description: string;
}

const referenceMaterials: ReferenceMaterial[] = [
  { id: 'paper-vla-rail', type: 'paper', name: 'VLA-RAIL Paper', description: 'arXiv:2512.24673' },
  { id: 'paper-rt1', type: 'paper', name: 'RT-1 Robotics Transformer', description: 'arXiv:2212.06817' },
  { id: 'paper-openvla', type: 'paper', name: 'OpenVLA', description: 'arXiv:2406.09246' },
  { id: 'code-benchmark', type: 'code', name: 'benchmark.py', description: 'VLA model benchmark script' },
  { id: 'code-viz', type: 'code', name: 'visualization.ipynb', description: 'Results visualization notebook' },
  { id: 'notes-vla', type: 'notes', name: 'VLA Research Notes', description: 'Key findings and analysis' },
  { id: 'notes-ablation', type: 'notes', name: 'Ablation Study', description: 'Attention mechanism comparison' },
  { id: 'latex-experiment', type: 'latex', name: 'experiment.tex', description: 'Experiments section draft' },
  { id: 'latex-paper', type: 'latex', name: 'main.tex', description: 'Full paper draft' },
];

const materialTypeConfig: Record<ReferenceMaterial['type'], { icon: React.ReactNode; color: string }> = {
  paper: { icon: <BookOpen className="w-4 h-4" />, color: 'text-rose-500' },
  code: { icon: <Code className="w-4 h-4" />, color: 'text-emerald-500' },
  notes: { icon: <FileText className="w-4 h-4" />, color: 'text-blue-500' },
  latex: { icon: <FunctionSquare className="w-4 h-4" />, color: 'text-amber-500' },
};

// Typewriter placeholder texts
const placeholderTexts = [
  '@ResearchBot analyze this paper',
  '#VLA-RAIL-Paper reference',
  '@CodeBot write benchmark',
  '#experiment.tex update results',
  '@WritingBot summarize findings',
];

export const ChatInput = memo(function ChatInput({
  onSend,
  participants = [],
  disabled = false,
  placeholder: staticPlaceholder,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentions, setMentions] = useState<string[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  
  // # reference related state
  const [showReferences, setShowReferences] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [references, setReferences] = useState<string[]>([]);
  
  // Typewriter effect state
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionStartRef = useRef<number>(-1);
  const referenceStartRef = useRef<number>(-1);

  // Typewriter effect (skip when disabled — show static placeholder instead)
  useEffect(() => {
    if (value || disabled) return;

    const currentText = placeholderTexts[placeholderIndex];
    const typingSpeed = isDeleting ? 30 : 80;
    const pauseTime = isDeleting ? 500 : 2000;

    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (charIndex < currentText.length) {
          setCharIndex(charIndex + 1);
        } else {
          setTimeout(() => setIsDeleting(true), pauseTime);
        }
      } else {
        if (charIndex > 0) {
          setCharIndex(charIndex - 1);
        } else {
          setIsDeleting(false);
          setPlaceholderIndex((placeholderIndex + 1) % placeholderTexts.length);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [value, disabled, charIndex, isDeleting, placeholderIndex]);

  // Current placeholder: static when disabled, animated otherwise
  const displayPlaceholder = disabled
    ? (staticPlaceholder || 'Start the agent to chat...')
    : (value ? '' : placeholderTexts[placeholderIndex].slice(0, charIndex) + '|');

  // Filter mentionable participants
  const filteredParticipants = useMemo(() => {
    if (!mentionQuery) return participants;
    const query = mentionQuery.toLowerCase();
    return participants.filter((p) => 
      p.name.toLowerCase().includes(query)
    );
  }, [participants, mentionQuery]);

  // Filter referenceable materials
  const filteredMaterials = useMemo(() => {
    if (!referenceQuery) return referenceMaterials;
    const query = referenceQuery.toLowerCase();
    return referenceMaterials.filter((m) => 
      m.name.toLowerCase().includes(query) || 
      m.description.toLowerCase().includes(query) ||
      m.type.includes(query)
    );
  }, [referenceQuery]);

  // Handle input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    setValue(newValue);

    // Detect @ symbol (mention people)
    const lastAtIndex = newValue.lastIndexOf('@', cursorPos - 1);
    if (lastAtIndex !== -1 && lastAtIndex >= mentionStartRef.current - 1) {
      const afterAt = newValue.slice(lastAtIndex + 1, cursorPos);
      if (!afterAt.includes(' ')) {
        mentionStartRef.current = lastAtIndex;
        setMentionQuery(afterAt);
        setShowMentions(true);
        setMentionIndex(0);
        setShowReferences(false);
        setShowCommands(false);
        return;
      }
    }
    
    setShowMentions(false);
    mentionStartRef.current = -1;

    // Detect # symbol (reference materials)
    const lastHashIndex = newValue.lastIndexOf('#', cursorPos - 1);
    if (lastHashIndex !== -1 && lastHashIndex >= referenceStartRef.current - 1) {
      const afterHash = newValue.slice(lastHashIndex + 1, cursorPos);
      if (!afterHash.includes(' ')) {
        referenceStartRef.current = lastHashIndex;
        setReferenceQuery(afterHash);
        setShowReferences(true);
        setReferenceIndex(0);
        setShowMentions(false);
        setShowCommands(false);
        return;
      }
    }
    
    setShowReferences(false);
    referenceStartRef.current = -1;

    // Detect / commands
    if (newValue.startsWith('/') && !newValue.includes(' ')) {
      setShowCommands(true);
      setShowMentions(false);
      setShowReferences(false);
    } else {
      setShowCommands(false);
    }
  }, []);

  // Insert mention
  const insertMention = useCallback((participant: Participant) => {
    const start = mentionStartRef.current;
    const before = value.slice(0, start);
    const after = value.slice(inputRef.current?.selectionStart || start);
    const mention = `@${participant.name} `;
    
    setValue(before + mention + after);
    setMentions((prev) => [...prev, participant.id]);
    setShowMentions(false);
    mentionStartRef.current = -1;
    
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = start + mention.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [value]);

  // Insert reference
  const insertReference = useCallback((material: ReferenceMaterial) => {
    const start = referenceStartRef.current;
    const before = value.slice(0, start);
    const after = value.slice(inputRef.current?.selectionStart || start);
    const reference = `#${material.name} `;
    
    setValue(before + reference + after);
    setReferences((prev) => [...prev, material.id]);
    setShowReferences(false);
    referenceStartRef.current = -1;
    
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = start + reference.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [value]);

  // Insert command
  const insertCommand = useCallback((command: string) => {
    setValue(command);
    setShowCommands(false);
    inputRef.current?.focus();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Mention list navigation (@)
    if (showMentions && filteredParticipants.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredParticipants.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredParticipants.length) % filteredParticipants.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredParticipants[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    // Reference list navigation (#)
    if (showReferences && filteredMaterials.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setReferenceIndex((i) => (i + 1) % filteredMaterials.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setReferenceIndex((i) => (i - 1 + filteredMaterials.length) % filteredMaterials.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertReference(filteredMaterials[referenceIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowReferences(false);
        return;
      }
    }

    // Send message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [showMentions, showReferences, filteredParticipants, filteredMaterials, mentionIndex, referenceIndex, insertMention, insertReference]);

  // Submit
  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(
        trimmed, 
        mentions.length > 0 ? mentions : undefined,
        references.length > 0 ? references : undefined
      );
      setValue('');
      setMentions([]);
      setReferences([]);
      inputRef.current?.focus();
    }
  }, [value, disabled, onSend, mentions, references]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setShowMentions(false);
      setShowCommands(false);
      setShowReferences(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      {/* Mention list (@) */}
      <AnimatePresence>
        {showMentions && filteredParticipants.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-slate-100">
              <span className="text-xs text-slate-500">@ Select member</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredParticipants.map((p, index) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => insertMention(p)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                    ${index === mentionIndex ? 'bg-violet-50' : 'hover:bg-slate-50'}
                  `}
                >
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    ${p.type === 'agent' 
                      ? 'bg-gradient-to-br from-violet-500 to-purple-600' 
                      : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                    }
                  `}>
                    {p.type === 'agent' ? (
                      <Bot className="w-4 h-4 text-white" />
                    ) : (
                      <User className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.type === 'agent' ? 'AI Agent' : p.role}
                    </div>
                  </div>
                  <div className={`
                    w-2 h-2 rounded-full
                    ${p.status === 'online' ? 'bg-emerald-500' : p.status === 'busy' ? 'bg-amber-500' : 'bg-slate-300'}
                  `} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reference list (#) */}
      <AnimatePresence>
        {showReferences && filteredMaterials.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-slate-100 flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">Reference material</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredMaterials.map((m, index) => {
                const config = materialTypeConfig[m.type];
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => insertReference(m)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                      ${index === referenceIndex ? 'bg-violet-50' : 'hover:bg-slate-50'}
                    `}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center ${config.color}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{m.name}</div>
                      <div className="text-xs text-slate-500 truncate">{m.description}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
                      {m.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick commands (/) */}
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-slate-100">
              <span className="text-xs text-slate-500">/ Quick commands</span>
            </div>
            {quickCommands.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => insertCommand(cmd.command)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-violet-500" />
                <div>
                  <div className="text-sm font-medium text-slate-900">{cmd.label}</div>
                  <div className="text-xs text-slate-500 font-mono">{cmd.command}</div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area - rounded rectangle card */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-2xl shadow-sm border border-slate-200"
      >
        {/* Attachment button */}
        <button
          type="button"
          disabled={disabled}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Add attachment"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Input container */}
        <div className="flex-1 relative flex items-center">
          {/* Selected tags (@ mentions and # references) */}
          {(mentions.length > 0 || references.length > 0) && (
            <div className="absolute -top-8 left-0 flex items-center gap-1 flex-wrap">
              {/* @ mention tags */}
              {mentions.map((id) => {
                const p = participants.find((p) => p.id === id);
                if (!p) return null;
                return (
                  <span
                    key={`mention-${id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full"
                  >
                    @{p.name}
                    <button
                      type="button"
                      onClick={() => setMentions((prev) => prev.filter((m) => m !== id))}
                      className="hover:text-violet-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              {/* # reference tags */}
              {references.map((id) => {
                const m = referenceMaterials.find((m) => m.id === id);
                if (!m) return null;
                const config = materialTypeConfig[m.type];
                return (
                  <span
                    key={`ref-${id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full"
                  >
                    <span className={config.color}>#</span>
                    {m.name}
                    <button
                      type="button"
                      onClick={() => setReferences((prev) => prev.filter((r) => r !== id))}
                      className="hover:text-slate-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={displayPlaceholder}
            disabled={disabled}
            rows={1}
            // iOS mobile optimization
            enterKeyHint="send"
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck={false}
            className="
              w-full px-1
              bg-transparent border-none
              text-sm text-slate-900 placeholder:text-violet-400/70 placeholder:font-mono
              resize-none
              focus:outline-none
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center
            "
            style={{ 
              height: '40px', 
              maxHeight: '120px',
              lineHeight: '40px',
              paddingTop: '0',
              paddingBottom: '0',
              // Prevent iOS auto-zoom
              fontSize: '16px',
            }}
          />
        </div>

        {/* Voice button */}
        <button
          type="button"
          disabled={disabled}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Voice input"
        >
          <Mic className="w-5 h-5" />
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className="
            p-2.5 rounded-xl flex-shrink-0
            bg-violet-500 text-white
            hover:bg-violet-600
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors
          "
          aria-label="Send"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
});

export default ChatInput;
