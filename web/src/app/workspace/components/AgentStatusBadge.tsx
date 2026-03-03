/**
 * AgentStatusBadge - Agent Status Indicator
 *
 * @description
 * Displays the running status of the Agent Instance bound to the current Workspace.
 * Used in ChatHeader, MobileHeader, etc. to provide quick status feedback.
 *
 * Status descriptions:
 * - idle: Gray, not bound or not started
 * - starting: Flashing yellow, starting up
 * - running: Green, running normally
 * - stopped: Gray, stopped
 * - error: Red, error occurred
 *
 * @example
 * ```tsx
 * // Basic usage
 * <AgentStatusBadge />
 *
 * // Show detailed info
 * <AgentStatusBadge showLabel />
 *
 * // Custom size
 * <AgentStatusBadge size="lg" />
 * ```
 */

'use client';

import { useAgentInstance } from '../stores/workspaceStore';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface AgentStatusBadgeProps {
  /** Whether to show the status text label */
  showLabel?: boolean;
  /** Badge size */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class name */
  className?: string;
}

// ============================================================
// Status Config
// ============================================================

/**
 * Status configuration map
 * Defines the color, animation, and label for each status
 */
const STATUS_CONFIG = {
  idle: {
    color: 'bg-gray-400',
    pulse: false,
    label: 'Idle',
    description: 'Agent not started',
  },
  starting: {
    color: 'bg-yellow-400',
    pulse: true,
    label: 'Starting',
    description: 'Agent is starting...',
  },
  running: {
    color: 'bg-green-500',
    pulse: false,
    label: 'Running',
    description: 'Agent is running',
  },
  stopped: {
    color: 'bg-gray-400',
    pulse: false,
    label: 'Stopped',
    description: 'Agent is stopped',
  },
  error: {
    color: 'bg-red-500',
    pulse: false,
    label: 'Error',
    description: 'Agent encountered an error',
  },
} as const;

/**
 * Size configuration
 */
const SIZE_CONFIG = {
  sm: {
    dot: 'h-2 w-2',
    text: 'text-xs',
  },
  md: {
    dot: 'h-2.5 w-2.5',
    text: 'text-sm',
  },
  lg: {
    dot: 'h-3 w-3',
    text: 'text-base',
  },
} as const;

// ============================================================
// Component
// ============================================================

export function AgentStatusBadge({
  showLabel = false,
  size = 'md',
  className,
}: AgentStatusBadgeProps) {
  const { status, hasAgent, error } = useAgentInstance();

  // If no Agent is bound, show empty state
  if (!hasAgent) {
    return showLabel ? (
      <span className={cn('text-muted-foreground', SIZE_CONFIG[size].text, className)}>
        No Agent
      </span>
    ) : null;
  }

  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      title={error || config.description}
    >
      {/* Status Dot */}
      <span className="relative flex">
        <span
          className={cn(
            'rounded-full',
            sizeConfig.dot,
            config.color,
            config.pulse && 'animate-pulse'
          )}
        />
        {/* Pulse ring for starting state */}
        {config.pulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              config.color
            )}
          />
        )}
      </span>

      {/* Status Label */}
      {showLabel && (
        <span
          className={cn(
            'font-medium',
            sizeConfig.text,
            status === 'error' ? 'text-red-500' : 'text-foreground'
          )}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}

export default AgentStatusBadge;
