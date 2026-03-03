/**
 * Container Types (Open-Source Slim)
 *
 * Core types for container health checks and status monitoring.
 */

// ============================================================
// Container Status
// ============================================================

export type ContainerState =
  | 'pending'      // Waiting to be created
  | 'creating'     // Creating
  | 'running'      // Running
  | 'paused'       // Paused
  | 'stopping'     // Stopping
  | 'stopped'      // Stopped
  | 'error';       // Error

export interface ContainerStatus {
  containerId: string;
  state: ContainerState;
  uptime?: number;
  startedAt?: Date;
  stoppedAt?: Date;
  resources?: {
    cpuPercent: number;
    memoryUsage: number;
    memoryLimit: number;
  };
  ports?: Array<{
    containerPort: number;
    hostPort: number;
    protocol: 'tcp' | 'udp';
  }>;
  exitCode?: number;
  error?: string;
}

// ============================================================
// Health Check
// ============================================================

export interface HealthCheckResult {
  healthy: boolean;
  checkedAt: Date;
  gateway: {
    connected: boolean;
    url?: string;
    latency?: number;
  };
  container: {
    running: boolean;
    uptime?: number;
  };
  versions?: Record<string, string>;
  versionCompatible?: boolean;
  details?: Record<string, unknown>;
  error?: string;
}
