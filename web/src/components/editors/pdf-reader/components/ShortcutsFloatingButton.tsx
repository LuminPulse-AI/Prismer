"use client";

import React, { useState, useEffect, useCallback } from "react";
import { HelpCircle, X, Keyboard } from "lucide-react";

interface ShortcutsFloatingButtonProps {
  isIndexPanelOpen: boolean;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

interface Shortcut {
  key: string;
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation shortcuts
  { key: "←/→", description: "Previous/Next page", category: "Navigation" },
  { key: "↑/↓", description: "Scroll up/down", category: "Navigation" },

  // Zoom shortcuts
  { key: "Ctrl/Cmd + +/-", description: "Precise zoom", category: "Zoom" },
  { key: "Ctrl/Cmd + 0", description: "Reset zoom", category: "Zoom" },
  {
    key: "Mouse wheel",
    description: "Quick zoom (hold Ctrl)",
    category: "Zoom",
  },
];

export const ShortcutsFloatingButton: React.FC<
  ShortcutsFloatingButtonProps
> = ({ isIndexPanelOpen, isOpen, onToggle }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  // Use externally controlled state or internal state
  const isTooltipOpen = isOpen !== undefined ? isOpen : internalIsOpen;

  const handleToggle = useCallback(
    (newState: boolean) => {
      if (onToggle) {
        onToggle(newState);
      } else {
        setInternalIsOpen(newState);
      }
    },
    [onToggle]
  );

  // Handle Escape key to close shortcuts panel
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTooltipOpen) {
        handleToggle(false);
      }
    };

    if (isTooltipOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isTooltipOpen, handleToggle]);

  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, Shortcut[]>
  );

  return (
    <>
      {/* Floating button */}
      <div
        className={`absolute z-40 transition-all duration-300 ease-in-out ${
          isIndexPanelOpen ? "left-[336px]" : "left-4"
        } bottom-4`}
      >
        <button
          onClick={() => handleToggle(!isTooltipOpen)}
          className={`relative bg-gradient-to-br from-white to-gray-50 backdrop-blur-md border rounded-full p-2 shadow-lg hover:shadow-xl transition-all duration-300 group ${
            isTooltipOpen
              ? "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300 scale-110 shadow-blue-200/60"
              : "border-gray-200/80 hover:border-blue-300/60 hover:scale-105"
          }`}
          title="Show shortcuts (?)"
        >
          <HelpCircle
            className={`w-4 h-4 transition-all duration-300 ${
              isTooltipOpen
                ? "text-blue-600 rotate-180"
                : "text-gray-500 group-hover:text-blue-600 group-hover:rotate-12"
            }`}
          />
          {/* Small decorative dot */}
          <div
            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-300 ${
              isTooltipOpen ? "bg-blue-500 scale-100" : "bg-gray-400 scale-0"
            }`}
          />
        </button>
      </div>

      {/* Shortcuts panel */}
      {isTooltipOpen && (
        <>
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/10 backdrop-blur-sm z-50"
            onClick={() => handleToggle(false)}
          />

          {/* Shortcuts panel */}
          <div
            className={`absolute z-50 transition-all duration-300 ease-out ${
              isIndexPanelOpen ? "left-[336px]" : "left-4"
            } bottom-14 w-72 max-h-[65vh] bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-3 zoom-in-95`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100/80 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-purple-50/60">
              <div className="flex items-center gap-1.5">
                <div className="p-1 bg-blue-100/80 rounded-lg">
                  <Keyboard className="w-3 h-3 text-blue-600" />
                </div>
              </div>
              <button
                onClick={() => handleToggle(false)}
                className="p-1 hover:bg-gray-100/80 rounded-lg transition-all duration-200 hover:scale-110"
              >
                <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* Shortcuts list */}
            <div className="overflow-y-auto max-h-[calc(65vh-45px)] scrollbar-thin scrollbar-thumb-gray-300/80 scrollbar-track-transparent hover:scrollbar-thumb-gray-400/80">
              {Object.entries(groupedShortcuts).map(
                ([category, categoryShortcuts]) => (
                  <div
                    key={category}
                    className="px-3 py-2 border-b border-gray-50/80 last:border-b-0 bg-gray-50/40 transition-colors"
                  >
                    <h4 className="font-medium text-gray-700 mb-1.5 text-xs uppercase tracking-wide flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full" />
                      {category}
                    </h4>
                    <div className="space-y-1">
                      {categoryShortcuts.map((shortcut, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between py-1 px-1 group rounded-lg transition-all"
                        >
                          <span className="text-gray-600 text-xs font-medium leading-relaxed">
                            {shortcut.description}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {shortcut.key.includes("/") ? (
                              shortcut.key.split("/").map((key, i) => (
                                <React.Fragment key={i}>
                                  <kbd className="px-1.5 py-0.5 bg-gradient-to-b text-gray-700 text-xs font-mono rounded-md border border-gray-200 shadow-sm  transition-all duration-200">
                                    {key.trim()}
                                  </kbd>
                                  {i < shortcut.key.split("/").length - 1 && (
                                    <span className="text-gray-400 text-xs mx-0.5">
                                      /
                                    </span>
                                  )}
                                </React.Fragment>
                              ))
                            ) : (
                              <kbd className="px-1.5 py-0.5 bg-gradient-to-b text-gray-700 text-xs font-mono rounded-md border border-gray-200 shadow-sm  transition-all duration-200 min-w-[20px] text-center">
                                {shortcut.key}
                              </kbd>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
