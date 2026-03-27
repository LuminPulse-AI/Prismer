"use client";

import { useState, useCallback } from "react";
import { Link, ArrowRight, Loader2, AlertCircle, Check, X } from "lucide-react";
import { GithubIcon as Github } from "./icons";
import { GitHubService } from "../services/GitHubService";

// ============================================================
// Props
// ============================================================

interface GitHubImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (url: string) => Promise<void>;
}

// ============================================================
// Component
// ============================================================

export function GitHubImporter({ isOpen, onClose, onImport }: GitHubImporterProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isValidUrl = GitHubService.isValidGitHubUrl(url);
  const parsedUrl = GitHubService.parseGitHubUrl(url);

  const handleSubmit = useCallback(async () => {
    if (!isValidUrl || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await onImport(url);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setUrl("");
        setSuccess(false);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setIsLoading(false);
    }
  }, [url, isValidUrl, isLoading, onImport, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isValidUrl) {
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-xl shadow-2xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-800">
              <Github className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Import from GitHub
              </h2>
              <p className="text-xs text-slate-400">
                Enter a GitHub repository URL
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* URL Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Repository URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Link className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="https://github.com/owner/repo"
                className="
                  w-full pl-10 pr-4 py-3 
                  bg-slate-800 border border-slate-700 rounded-lg
                  text-sm text-white placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                  transition-all
                "
              />
            </div>
          </div>

          {/* Parsed URL Info */}
          {parsedUrl && (
            <div className="mb-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center gap-2 text-sm">
                <Github className="h-4 w-4 text-slate-400" />
                <span className="text-slate-400">Repository:</span>
                <span className="text-white font-medium">
                  {parsedUrl.owner}/{parsedUrl.repo}
                </span>
              </div>
              {parsedUrl.path && (
                <div className="mt-1 text-xs text-slate-500">
                  Path: {parsedUrl.path}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Check className="h-4 w-4" />
              <span className="text-sm">Successfully imported!</span>
            </div>
          )}

          {/* Help Text */}
          <div className="text-xs text-slate-500 mb-4">
            <p className="mb-2">Supported URL formats:</p>
            <ul className="space-y-1 ml-4">
              <li>• https://github.com/owner/repo</li>
              <li>• https://github.com/owner/repo/tree/branch/path</li>
              <li>• owner/repo</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={!isValidUrl || isLoading}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${isValidUrl
                ? "bg-violet-500 text-white hover:bg-violet-600"
                : "bg-slate-700 text-slate-500 cursor-not-allowed"
              }
              disabled:opacity-50
            `}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
