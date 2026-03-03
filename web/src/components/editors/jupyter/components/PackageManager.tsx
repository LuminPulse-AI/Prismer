'use client';

/**
 * PackageManager - Python Package Management Component
 *
 * Supports multiple package managers:
 * - UV (uv pip install)
 * - pip (pip install)
 * - conda (conda install) [detection only]
 *
 * Auto-detects the environment and selects the appropriate package manager
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import {
  Package,
  RefreshCw,
  Search,
  Download,
  Upload,
  Trash2,
  Plus,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  X,
  Settings,
  Zap,
} from 'lucide-react';
import type { JupyterService } from '../services/JupyterService';

// ============================================================
// Type Definitions
// ============================================================

export type PackageManagerType = 'uv' | 'pip' | 'conda' | 'auto';

export interface InstalledPackage {
  name: string;
  version: string;
  summary?: string;
  location?: string;
  requires?: string[];
  homepage?: string;
  latestVersion?: string;
  hasUpdate?: boolean;
}

interface PackageManagerProps {
  jupyterService: JupyterService | null;
  isConnected: boolean;
  preferredManager?: PackageManagerType;
  className?: string;
}

// ============================================================
// Python Code Snippets
// ============================================================

// Detect available package managers
const DETECT_MANAGER_CODE = `
import json
import subprocess
import shutil

def detect_package_manager():
    result = {
        "uv": False,
        "pip": False,
        "conda": False,
        "uv_path": None,
        "pip_path": None,
        "in_uv_env": False,
        "recommended": "pip"
    }
    
    # Detect UV
    uv_path = shutil.which("uv")
    if uv_path:
        result["uv"] = True
        result["uv_path"] = uv_path
        # Check if running in a UV-managed environment
        import os
        if os.environ.get("UV_CACHE_DIR") or os.environ.get("VIRTUAL_ENV", "").find(".venv") != -1:
            result["in_uv_env"] = True
            result["recommended"] = "uv"
    
    # Detect pip
    pip_path = shutil.which("pip") or shutil.which("pip3")
    if pip_path:
        result["pip"] = True
        result["pip_path"] = pip_path
    
    # Detect conda
    if shutil.which("conda"):
        result["conda"] = True
        import os
        if os.environ.get("CONDA_DEFAULT_ENV"):
            result["recommended"] = "conda"
    
    # If UV is available and we're in a UV environment, prefer UV
    if result["uv"] and result["in_uv_env"]:
        result["recommended"] = "uv"
    
    print(json.dumps(result))

detect_package_manager()
`;

// Get installed packages (universal method, not dependent on pip)
const GET_PACKAGES_CODE = `
import json
import sys

def get_installed_packages():
    packages = []
    
    # 方法1: 使用 importlib.metadata (Python 3.8+)
    try:
        from importlib.metadata import distributions
        for dist in distributions():
            try:
                packages.append({
                    "name": dist.metadata["Name"],
                    "version": dist.version,
                    "location": str(dist._path.parent) if hasattr(dist, '_path') else None,
                })
            except Exception:
                pass
        if packages:
            print(json.dumps(packages))
            return
    except ImportError:
        pass
    
    # 方法2: 使用 pkg_resources (fallback)
    try:
        import pkg_resources
        for pkg in pkg_resources.working_set:
            try:
                packages.append({
                    "name": pkg.project_name,
                    "version": pkg.version,
                    "location": pkg.location,
                })
            except Exception:
                pass
        print(json.dumps(packages))
        return
    except ImportError:
        pass
    
    print(json.dumps({"error": "Cannot list packages: no suitable method found"}))

get_installed_packages()
`;

// Generate install command - with real-time output
function getInstallCommand(manager: PackageManagerType, packageSpec: string): string {
  // Use Popen for real-time output instead of run() which waits for completion
  const baseCode = `
import subprocess
import sys

def run_with_realtime_output(cmd):
    """Run command with real-time output"""
    print(f">>> Running: {' '.join(cmd)}")
    print("-" * 40)
    sys.stdout.flush()

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True
    )

    for line in process.stdout:
        print(line, end='')
        sys.stdout.flush()

    process.wait()
    print("-" * 40)

    if process.returncode == 0:
        print("✓ SUCCESS")
    else:
        print(f"✗ FAILED (exit code: {process.returncode})")

    return process.returncode == 0
`;

  switch (manager) {
    case 'uv':
      return baseCode + `
run_with_realtime_output(["uv", "pip", "install", "${packageSpec}"])
`;
    case 'conda':
      return baseCode + `
run_with_realtime_output(["conda", "install", "-y", "${packageSpec}"])
`;
    case 'pip':
    default:
      return baseCode + `
run_with_realtime_output([sys.executable, "-m", "pip", "install", "${packageSpec}", "--progress-bar", "on"])
`;
  }
}

// Generate uninstall command - with real-time output
function getUninstallCommand(manager: PackageManagerType, packageName: string): string {
  const baseCode = `
import subprocess
import sys

def run_with_realtime_output(cmd):
    """Run command with real-time output"""
    print(f">>> Running: {' '.join(cmd)}")
    print("-" * 40)
    sys.stdout.flush()
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True
    )
    
    for line in process.stdout:
        print(line, end='')
        sys.stdout.flush()
    
    process.wait()
    print("-" * 40)
    
    if process.returncode == 0:
        print("✓ SUCCESS")
    else:
        print(f"✗ FAILED (exit code: {process.returncode})")
    
    return process.returncode == 0
`;

  switch (manager) {
    case 'uv':
      return baseCode + `
run_with_realtime_output(["uv", "pip", "uninstall", "${packageName}"])
`;
    case 'conda':
      return baseCode + `
run_with_realtime_output(["conda", "remove", "-y", "${packageName}"])
`;
    case 'pip':
    default:
      return baseCode + `
run_with_realtime_output([sys.executable, "-m", "pip", "uninstall", "-y", "${packageName}"])
`;
  }
}

// ============================================================
// PackageManager Component
// ============================================================

export const PackageManager = memo(function PackageManager({
  jupyterService,
  isConnected,
  preferredManager = 'auto',
  className = '',
}: PackageManagerProps) {
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  
  // Package manager state
  const [detectedManager, setDetectedManager] = useState<{
    uv: boolean;
    pip: boolean;
    conda: boolean;
    recommended: PackageManagerType;
  }>({ uv: false, pip: false, conda: false, recommended: 'pip' });
  const [activeManager, setActiveManager] = useState<PackageManagerType>('pip');
  const [showSettings, setShowSettings] = useState(false);
  
  // Install dialog state
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [installInput, setInstallInput] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState('');
  const [installStatus, setInstallStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Detect package manager
  const detectManager = useCallback(async () => {
    if (!jupyterService || !isConnected) return;

    try {
      const handle = jupyterService.execute('__detect_manager__', DETECT_MANAGER_CODE);
      let output = '';

      handle.onOutput((o) => {
        if (o.type === 'stream' && o.name === 'stdout') {
          output += o.text;
        }
      });

      await handle.done;

      if (output) {
        try {
          const data = JSON.parse(output.trim());
          setDetectedManager({
            uv: data.uv,
            pip: data.pip,
            conda: data.conda,
            recommended: data.recommended,
          });
          
          // Auto-select
          if (preferredManager === 'auto') {
            setActiveManager(data.recommended);
          } else {
            setActiveManager(preferredManager);
          }
        } catch {
          // Default to pip
          setActiveManager('pip');
        }
      }
    } catch (err) {
      console.error('Failed to detect package manager:', err);
    }
  }, [jupyterService, isConnected, preferredManager]);

  // Fetch installed packages
  const fetchPackages = useCallback(async () => {
    if (!jupyterService || !isConnected) return;

    setIsLoading(true);
    setError(null);

    try {
      const handle = jupyterService.execute('__packages__', GET_PACKAGES_CODE);
      let output = '';

      handle.onOutput((o) => {
        if (o.type === 'stream' && o.name === 'stdout') {
          output += o.text;
        }
      });

      const result = await handle.done;

      if (result.status === 'ok' && output) {
        try {
          const data = JSON.parse(output.trim());
          if (data.error) {
            setError(data.error);
          } else {
            setPackages(data.sort((a: InstalledPackage, b: InstalledPackage) => 
              a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            ));
          }
        } catch {
          setError('Failed to parse package data');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch packages');
    } finally {
      setIsLoading(false);
    }
  }, [jupyterService, isConnected]);

  // Auto-detect and refresh on connection
  useEffect(() => {
    if (isConnected) {
      detectManager();
      fetchPackages();
    } else {
      setPackages([]);
    }
  }, [isConnected, detectManager, fetchPackages]);

  // Install package
  const installPackage = useCallback(async (packageSpec: string) => {
    if (!jupyterService || !isConnected) return;

    setIsInstalling(true);
    setInstallStatus('idle');
    setInstallOutput('');

    try {
      const code = getInstallCommand(activeManager, packageSpec);
      const handle = jupyterService.execute('__install__', code);
      let output = '';
      
      handle.onOutput((o) => {
        if (o.type === 'stream') {
          output += o.text;
          setInstallOutput(output);
        }
      });

      await handle.done;
      
      if (output.includes('SUCCESS')) {
        setInstallStatus('success');
        await fetchPackages();
        setTimeout(() => {
          setShowInstallDialog(false);
          setInstallInput('');
          setInstallStatus('idle');
          setInstallOutput('');
        }, 1500);
      } else {
        setInstallStatus('error');
        setError(output.replace('ERROR: ', ''));
      }
    } catch (err) {
      setInstallStatus('error');
      setError(err instanceof Error ? err.message : 'Installation failed');
    } finally {
      setIsInstalling(false);
    }
  }, [jupyterService, isConnected, activeManager, fetchPackages]);

  // Uninstall dialog state
  const [uninstallDialog, setUninstallDialog] = useState<{
    isOpen: boolean;
    packageName: string;
    output: string;
    isRunning: boolean;
    status: 'idle' | 'success' | 'error';
  }>({ isOpen: false, packageName: '', output: '', isRunning: false, status: 'idle' });

  // Uninstall package
  const uninstallPackage = useCallback(async (packageName: string) => {
    if (!jupyterService || !isConnected) return;

    // Show uninstall dialog
    setUninstallDialog({
      isOpen: true,
      packageName,
      output: '',
      isRunning: true,
      status: 'idle',
    });

    try {
      const code = getUninstallCommand(activeManager, packageName);
      const handle = jupyterService.execute('__uninstall__', code);
      
      handle.onOutput((o) => {
        if (o.type === 'stream') {
          setUninstallDialog(prev => ({
            ...prev,
            output: prev.output + o.text,
          }));
        }
      });

      await handle.done;
      
      setUninstallDialog(prev => {
        const success = prev.output.includes('SUCCESS');
        return {
          ...prev,
          isRunning: false,
          status: success ? 'success' : 'error',
        };
      });
      
      // Refresh list on success
      const finalOutput = uninstallDialog.output;
      if (finalOutput.includes('SUCCESS') || !finalOutput.includes('FAILED')) {
        await fetchPackages();
      }
    } catch (err) {
      setUninstallDialog(prev => ({
        ...prev,
        isRunning: false,
        status: 'error',
        output: prev.output + `\n\n✗ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    }
  }, [jupyterService, isConnected, activeManager, fetchPackages, uninstallDialog.output]);

  // Export requirements.txt
  const exportRequirements = useCallback(() => {
    const content = packages
      .map(p => `${p.name}==${p.version}`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'requirements.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [packages]);

  // Import requirements.txt
  const importRequirements = useCallback(async (file: File) => {
    const content = await file.text();
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    
    if (lines.length === 0) {
      setError('No packages found in file');
      return;
    }

    if (!confirm(`Install ${lines.length} packages from requirements.txt using ${activeManager}?`)) return;

    setIsInstalling(true);
    try {
      // Install one by one to track progress
      for (const line of lines) {
        const packageSpec = line.trim();
        if (packageSpec) {
          await installPackage(packageSpec);
        }
      }
      await fetchPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsInstalling(false);
    }
  }, [activeManager, installPackage, fetchPackages]);

  // Filter packages
  const filteredPackages = packages.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get manager icon and color
  const getManagerStyle = (manager: PackageManagerType) => {
    switch (manager) {
      case 'uv':
        return { icon: <Zap size={12} />, color: 'text-yellow-400', bg: 'bg-yellow-900/30' };
      case 'conda':
        return { icon: <Package size={12} />, color: 'text-green-400', bg: 'bg-green-900/30' };
      default:
        return { icon: <Package size={12} />, color: 'text-blue-400', bg: 'bg-blue-900/30' };
    }
  };

  const managerStyle = getManagerStyle(activeManager);

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-stone-600" />
          <span className="text-sm font-medium text-stone-700">Packages</span>
          <span className="text-xs text-stone-500">({packages.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Current manager label */}
          <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${managerStyle.bg} ${managerStyle.color}`}>
            {managerStyle.icon}
            {activeManager.toUpperCase()}
          </span>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1 rounded ${showSettings ? 'bg-stone-200 text-stone-800' : 'text-stone-600 hover:text-stone-800 hover:bg-stone-200/60'}`}
            title="Settings"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={() => setShowInstallDialog(true)}
            disabled={!isConnected}
            className="p-1 hover:bg-stone-200/60 rounded text-green-600 hover:text-green-700 disabled:opacity-50"
            title="Install package"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              detectManager();
              fetchPackages();
            }}
            disabled={!isConnected || isLoading}
            className="p-1 hover:bg-stone-200/60 rounded text-stone-600 hover:text-stone-800 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-stone-200 bg-stone-50">
          <div className="text-xs text-stone-500 mb-2">Package Manager</div>
          <div className="flex gap-1">
            {(['pip', 'uv', 'conda'] as const).map(manager => {
              const style = getManagerStyle(manager);
              const isAvailable = manager === 'pip' ? detectedManager.pip : 
                                  manager === 'uv' ? detectedManager.uv : 
                                  detectedManager.conda;
              const isRecommended = detectedManager.recommended === manager;
              
              return (
                <button
                  key={manager}
                  onClick={() => isAvailable && setActiveManager(manager)}
                  disabled={!isAvailable}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                    activeManager === manager
                      ? `${style.bg} ${style.color} ring-1 ring-current`
                      : isAvailable
                      ? 'bg-stone-100 text-stone-600 hover:text-stone-800'
                      : 'bg-stone-50 text-stone-400 cursor-not-allowed'
                  }`}
                >
                  {style.icon}
                  {manager.toUpperCase()}
                  {isRecommended && <span className="text-green-400">★</span>}
                </button>
              );
            })}
          </div>
          {detectedManager.uv && activeManager === 'uv' && (
            <div className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
              <Zap size={10} />
              UV detected - using fast package installer
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-stone-200">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search packages..."
            className="w-full pl-7 pr-3 py-1.5 bg-stone-100 border border-stone-200 rounded text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-stone-200">
        <button
          onClick={exportRequirements}
          disabled={packages.length === 0}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 rounded text-stone-600 hover:text-stone-800 disabled:opacity-50"
        >
          <Download size={12} />
          Export
        </button>
        <label className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 rounded text-stone-600 hover:text-stone-800 cursor-pointer">
          <Upload size={12} />
          Import
          <input
            type="file"
            accept=".txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importRequirements(file);
            }}
          />
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 text-red-600 text-xs flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="flex-1 break-all">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Package List */}
      <div className="flex-1 overflow-auto">
        {!isConnected && (
          <div className="p-4 text-center text-stone-500 text-sm">
            Connect to Kernel to view packages
          </div>
        )}

        {isConnected && isLoading && (
          <div className="p-4 flex items-center justify-center gap-2 text-stone-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        )}

        {isConnected && !isLoading && filteredPackages.length === 0 && (
          <div className="p-4 text-center text-stone-500 text-sm">
            {searchQuery ? 'No matching packages' : 'No packages installed'}
          </div>
        )}

        {filteredPackages.length > 0 && (
          <div className="divide-y divide-stone-200">
            {filteredPackages.map((pkg) => (
              <PackageItem
                key={pkg.name}
                package={pkg}
                isSelected={selectedPackage === pkg.name}
                onSelect={() => setSelectedPackage(
                  selectedPackage === pkg.name ? null : pkg.name
                )}
                onUninstall={() => uninstallPackage(pkg.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Install — inline within the panel */}
      {showInstallDialog && (
        <div className="px-3 py-3 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-700">Install Package</span>
            <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${managerStyle.bg} ${managerStyle.color}`}>
              {managerStyle.icon}
              {activeManager.toUpperCase()}
            </span>
          </div>
          <input
            type="text"
            value={installInput}
            onChange={(e) => setInstallInput(e.target.value)}
            placeholder="package-name or package==1.0.0"
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-2"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && installInput.trim()) {
                installPackage(installInput.trim());
              }
            }}
          />
          <InstallOutputArea output={installOutput} isRunning={isInstalling} />
          <div className="flex items-center justify-between mt-2">
            <div>
              {installStatus === 'success' && (
                <span className="text-green-600 text-xs flex items-center gap-1">
                  <Check size={12} /> Installed
                </span>
              )}
              {installStatus === 'error' && (
                <span className="text-red-600 text-xs">Failed</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowInstallDialog(false);
                  setInstallInput('');
                  setInstallOutput('');
                  setInstallStatus('idle');
                }}
                className="px-2 py-1 text-xs text-stone-600 hover:text-stone-800"
              >
                Cancel
              </button>
              <button
                onClick={() => installPackage(installInput.trim())}
                disabled={!installInput.trim() || isInstalling}
                className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50 flex items-center gap-1"
              >
                {isInstalling && <Loader2 size={12} className="animate-spin" />}
                Install
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uninstall — inline within the panel */}
      {uninstallDialog.isOpen && (
        <div className="px-3 py-3 border-b border-stone-200 bg-red-50/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-700">
              Uninstall {uninstallDialog.packageName}
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${managerStyle.bg} ${managerStyle.color}`}>
              {managerStyle.icon}
              {activeManager.toUpperCase()}
            </span>
          </div>
          <InstallOutputArea
            output={uninstallDialog.output}
            isRunning={uninstallDialog.isRunning}
          />
          <div className="flex items-center justify-between mt-2">
            <div>
              {uninstallDialog.status === 'success' && (
                <span className="text-green-600 text-xs flex items-center gap-1">
                  <Check size={12} /> Uninstalled
                </span>
              )}
              {uninstallDialog.status === 'error' && (
                <span className="text-red-600 text-xs">Failed</span>
              )}
            </div>
            <button
              onClick={() => {
                const wasSuccess = uninstallDialog.status === 'success';
                setUninstallDialog({
                  isOpen: false,
                  packageName: '',
                  output: '',
                  isRunning: false,
                  status: 'idle',
                });
                if (wasSuccess) fetchPackages();
              }}
              disabled={uninstallDialog.isRunning}
              className="px-2 py-1 text-xs bg-stone-200 hover:bg-stone-300 text-stone-800 rounded disabled:opacity-50"
            >
              {uninstallDialog.isRunning ? 'Please wait...' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================
// InstallOutputArea Component - Real-time Output Display
// ============================================================

interface InstallOutputAreaProps {
  output: string;
  isRunning: boolean;
}

const InstallOutputArea = memo(function InstallOutputArea({
  output,
  isRunning,
}: InstallOutputAreaProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom
  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output]);

  if (!output && !isRunning) {
    return null;
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-stone-500">Output</span>
        {isRunning && (
          <span className="flex items-center gap-1 text-xs text-blue-400">
            <Loader2 size={10} className="animate-spin" />
            Running...
          </span>
        )}
      </div>
      <div 
        ref={containerRef}
        className="max-h-48 overflow-auto bg-stone-50 rounded border border-stone-200 p-2"
      >
        {output ? (
          <pre className="text-xs font-mono whitespace-pre-wrap">
            {output.split('\n').map((line, i) => {
              // Color based on content
              let className = 'text-stone-600';
              if (line.startsWith('>>>')) {
                className = 'text-blue-400 font-semibold';
              } else if (line.includes('SUCCESS') || line.includes('✓')) {
                className = 'text-green-400 font-semibold';
              } else if (line.includes('FAILED') || line.includes('✗') || line.includes('ERROR') || line.includes('error')) {
                className = 'text-red-400';
              } else if (line.includes('WARNING') || line.includes('warning')) {
                className = 'text-yellow-400';
              } else if (line.includes('Downloading') || line.includes('Installing') || line.includes('Collecting')) {
                className = 'text-cyan-400';
              } else if (line.startsWith('-')) {
                className = 'text-stone-400';
              }
              return (
                <div key={i} className={className}>
                  {line || '\u00A0'}
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="text-xs text-stone-400 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Waiting for output...
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================
// PackageItem Component
// ============================================================

interface PackageItemProps {
  package: InstalledPackage;
  isSelected: boolean;
  onSelect: () => void;
  onUninstall: () => void;
}

const PackageItem = memo(function PackageItem({
  package: pkg,
  isSelected,
  onSelect,
  onUninstall,
}: PackageItemProps) {
  return (
    <div className={`${isSelected ? 'bg-stone-50' : 'hover:bg-stone-50/50'}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={onSelect}
      >
        <button className="p-0.5">
          {isSelected ? (
            <ChevronDown size={12} className="text-stone-500" />
          ) : (
            <ChevronRight size={12} className="text-stone-500" />
          )}
        </button>
        <Package size={14} className="text-blue-400" />
        <span className="text-sm text-stone-700 flex-1 truncate">{pkg.name}</span>
        <span className="text-xs text-stone-500 font-mono">{pkg.version}</span>
      </div>

      {isSelected && (
        <div className="px-3 pb-2 pl-10 space-y-1">
          {pkg.summary && (
            <p className="text-xs text-stone-600">{pkg.summary}</p>
          )}
          {pkg.location && (
            <div className="text-xs">
              <span className="text-stone-500">Location: </span>
              <span className="text-stone-600 font-mono truncate">{pkg.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUninstall();
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded"
            >
              <Trash2 size={10} />
              Uninstall
            </button>
            <a
              href={`https://pypi.org/project/${pkg.name}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 rounded"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />
              PyPI
            </a>
          </div>
        </div>
      )}
    </div>
  );
});

export default PackageManager;
