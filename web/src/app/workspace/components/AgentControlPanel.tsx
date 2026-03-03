/**
 * AgentControlPanel - Agent Control Panel
 *
 * @description
 * Provides full lifecycle control and observability for an Agent Instance, including:
 * - Start/stop Agent (supports Docker/Kubernetes orchestrator selection)
 * - Real-time startup progress display (SSE-driven)
 * - Runtime info panel (Container ID, Gateway URL, Port, Uptime)
 * - Clear and readable error messages
 *
 * @example
 * ```tsx
 * <AgentControlPanel />
 * <AgentControlPanel compact />
 * ```
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAgentInstance, useAgentInstanceStore, useContainerVersionInfo } from '../stores/agentInstanceStore';
import { Button } from '@/components/ui/button';
import {
  Play, Square, AlertCircle, Loader2,
  Container, Globe, Server, Clock, Activity, ChevronDown, ChevronUp, Tag, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentStatusBadge } from './AgentStatusBadge';

// ============================================================
// Types
// ============================================================

interface AgentControlPanelProps {
  compact?: boolean;
  className?: string;
}

// ============================================================
// Sub-Components
// ============================================================

function OrchestratorSelector({
  value,
  onChange,
  disabled,
}: {
  value: 'docker' | 'kubernetes';
  onChange: (v: 'docker' | 'kubernetes') => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => onChange('docker')}
        disabled={disabled}
        className={cn(
          'px-2 py-1 rounded-l-md border transition-colors',
          value === 'docker'
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background text-muted-foreground border-border hover:bg-accent',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Container className="h-3 w-3 inline mr-1" />
        Docker
      </button>
      <button
        type="button"
        onClick={() => onChange('kubernetes')}
        disabled={disabled}
        className={cn(
          'px-2 py-1 rounded-r-md border-y border-r transition-colors',
          value === 'kubernetes'
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background text-muted-foreground border-border hover:bg-accent',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Globe className="h-3 w-3 inline mr-1" />
        K8s
      </button>
    </div>
  );
}

function StartProgress({
  currentStep,
  totalSteps,
  message,
  detail,
}: {
  currentStep: number;
  totalSteps: number;
  message?: string;
  detail?: string;
}) {
  const percent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Step {currentStep}/{totalSteps}
        </span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      {message && (
        <p className="text-xs text-foreground">{message}</p>
      )}
      {detail && (
        <p className="text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

function RuntimeInfo({
  agentId,
  gatewayUrl,
  hostPort,
  orchestratorType,
  imageVersion,
  versionCompatible,
  startedAt,
}: {
  agentId: string | null;
  gatewayUrl: string | null;
  hostPort: number | null;
  orchestratorType: string | null;
  imageVersion: string | null;
  versionCompatible: boolean | null;
  startedAt?: Date;
}) {
  const [uptime, setUptime] = useState('');

  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const mins = Math.floor(seconds / 60);
      const hrs = Math.floor(mins / 60);
      if (hrs > 0) {
        setUptime(`${hrs}h ${mins % 60}m`);
      } else if (mins > 0) {
        setUptime(`${mins}m ${seconds % 60}s`);
      } else {
        setUptime(`${seconds}s`);
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const versionIcon = versionCompatible === false ? ShieldAlert : ShieldCheck;
  const versionLabel = versionCompatible === true ? 'Compatible' : versionCompatible === false ? 'Mismatch' : '—';

  const items = [
    { icon: Server, label: 'Agent ID', value: agentId ? `${agentId.slice(0, 12)}...` : '—' },
    { icon: Container, label: 'Orchestrator', value: orchestratorType || '—' },
    { icon: Activity, label: 'Port', value: hostPort ? String(hostPort) : '—' },
    { icon: Globe, label: 'Gateway', value: gatewayUrl ? gatewayUrl.replace('ws://localhost:', ':') : '—' },
    { icon: Tag, label: 'Image', value: imageVersion ? `v${imageVersion}` : '—' },
    { icon: versionIcon, label: 'Versions', value: versionLabel },
    ...(startedAt ? [{ icon: Clock, label: 'Uptime', value: uptime }] : []),
  ];

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-1.5 min-w-0">
          <Icon className={cn(
            'h-3 w-3 flex-shrink-0',
            label === 'Versions' && versionCompatible === false ? 'text-amber-500' : 'text-muted-foreground',
          )} />
          <span className="text-muted-foreground">{label}:</span>
          <span className={cn(
            'font-mono truncate',
            label === 'Versions' && versionCompatible === false ? 'text-amber-500' : 'text-foreground',
          )}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function AgentControlPanel({
  compact = false,
  className,
}: AgentControlPanelProps) {
  const { id, status, error, hasAgent, isRunning } = useAgentInstance();
  const startAgent = useAgentInstanceStore((s) => s.startAgentInstance);
  const stopAgent = useAgentInstanceStore((s) => s.stopAgentInstance);
  const agentState = useAgentInstanceStore((s) => s.agentState);
  const gatewayUrl = useAgentInstanceStore((s) => s.gatewayUrl);
  const containerHostPort = useAgentInstanceStore((s) => s.containerHostPort);
  const storedOrchestratorType = useAgentInstanceStore((s) => s.orchestratorType);
  const { imageVersion, versionCompatible } = useContainerVersionInfo();

  const workspaceId = useAgentInstanceStore((s) => s.workspaceId);

  // Orchestrator: derive from user override > store > workspace settings > default
  const [orchestratorOverride, setOrchestratorOverride] = useState<'docker' | 'kubernetes' | null>(null);
  const [wsSettings, setWsSettings] = useState<{ orchestrator?: string; imageTag?: string } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [runningStartedAt] = useState<Date | undefined>(isRunning ? new Date() : undefined);

  const selectedOrchestrator: 'docker' | 'kubernetes' =
    orchestratorOverride
    || (storedOrchestratorType as 'docker' | 'kubernetes')
    || (wsSettings?.orchestrator as 'docker' | 'kubernetes')
    || 'docker';

  // Load workspace settings for orchestrator/imageTag defaults
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/workspace/${workspaceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.settings) {
          setWsSettings(data.data.settings);
        }
      })
      .catch(() => {});
  }, [workspaceId]);

  const handleStart = useCallback(() => {
    startAgent(selectedOrchestrator, wsSettings?.imageTag || undefined);
  }, [startAgent, selectedOrchestrator, wsSettings]);

  if (!hasAgent) {
    return (
      <div className={cn('text-muted-foreground text-sm', className)}>
        No Agent bound to this workspace
      </div>
    );
  }

  const isLoading = status === 'starting';
  const isStarting = isLoading && agentState.currentStep !== undefined && agentState.currentStep > 0;

  // ==================== Compact Mode ====================
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <AgentStatusBadge size="sm" />
        {isRunning ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={stopAgent}
            className="h-7 px-2"
            title="Stop Agent"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStart}
            disabled={isLoading}
            className="h-7 px-2"
            title="Start Agent"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    );
  }

  // ==================== Full Mode ====================
  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AgentStatusBadge showLabel size="md" />
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button variant="outline" size="sm" onClick={stopAgent} className="gap-1.5">
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleStart}
              disabled={isLoading}
              className="gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Orchestrator Selector (only when not running) */}
      {!isRunning && !isLoading && (
        <OrchestratorSelector
          value={selectedOrchestrator}
          onChange={setOrchestratorOverride}
          disabled={isLoading}
        />
      )}

      {/* Start Progress (during startup) */}
      {isStarting && (
        <StartProgress
          currentStep={agentState.currentStep || 0}
          totalSteps={agentState.totalSteps || 6}
          message={agentState.stepMessage}
          detail={agentState.stepDetail}
        />
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Runtime Info Toggle (when running) */}
      {isRunning && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <div className="p-2 rounded-md bg-muted/50 space-y-2">
              <RuntimeInfo
                agentId={id}
                gatewayUrl={gatewayUrl}
                hostPort={containerHostPort}
                orchestratorType={storedOrchestratorType}
                imageVersion={imageVersion}
                versionCompatible={versionCompatible}
                startedAt={runningStartedAt}
              />
            </div>
          )}
        </>
      )}

      {/* Agent ID (minimal, when not showing details) */}
      {id && !isRunning && !isLoading && (
        <div className="text-xs text-muted-foreground">
          ID: <code className="px-1 py-0.5 bg-muted rounded">{id.slice(0, 12)}...</code>
        </div>
      )}
    </div>
  );
}

export default AgentControlPanel;
