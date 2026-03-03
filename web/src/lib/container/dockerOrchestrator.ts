/**
 * Docker Orchestrator (Open-Source Slim)
 *
 * Provides health checks, log retrieval, and command execution
 * for externally-managed Docker containers. Full lifecycle
 * orchestration (create/start/stop/remove/deploy) is not needed
 * in open-source mode where containers are managed via docker-compose.
 */

import type {
  ContainerStatus,
  ContainerState,
  HealthCheckResult,
} from './types';
import {
  ContainerOrchestrator,
  OrchestratorError,
} from './orchestrator';

// ============================================================
// Constants
// ============================================================

/** Container Gateway internal port */
const DEFAULT_GATEWAY_PORT = 3000;

/** OpenClaw Gateway proxy port (TCP proxy → 127.0.0.1:18900) */
const OPENCLAW_GATEWAY_PROXY_PORT = 18901;

// ============================================================
// Docker Orchestrator Implementation
// ============================================================

export class DockerOrchestrator implements ContainerOrchestrator {
  private docker: unknown = null;

  private async getDocker(): Promise<unknown> {
    if (this.docker) {
      return this.docker;
    }

    try {
      const Dockerode = (await import('dockerode')).default;
      this.docker = new Dockerode();
      await (this.docker as { ping: () => Promise<void> }).ping();
      return this.docker;
    } catch (error) {
      throw new OrchestratorError(
        'DOCKER_NOT_AVAILABLE',
        'Docker is not available. Please ensure Docker is installed and running.',
        undefined,
        error as Error
      );
    }
  }

  // ============================================================
  // Logs
  // ============================================================

  async getContainerLogs(
    containerId: string,
    options?: {
      tail?: number;
      since?: Date;
      timestamps?: boolean;
    }
  ): Promise<string> {
    const docker = await this.getDocker();

    try {
      const container = (docker as {
        getContainer: (id: string) => {
          logs: (opts: {
            stdout: boolean;
            stderr: boolean;
            tail: number;
            since: number;
            timestamps: boolean;
          }) => Promise<Buffer>;
        };
      }).getContainer(containerId);

      const logsBuffer = await container.logs({
        stdout: true,
        stderr: true,
        tail: options?.tail ?? 100,
        since: options?.since ? Math.floor(options.since.getTime() / 1000) : 0,
        timestamps: options?.timestamps ?? false,
      });

      return this.parseDockerLogs(logsBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('No such container')) {
        throw new OrchestratorError(
          'CONTAINER_NOT_FOUND',
          `Container ${containerId} not found`,
          containerId
        );
      }

      throw new OrchestratorError(
        'UNKNOWN_ERROR',
        `Failed to get container logs: ${message}`,
        containerId,
        error as Error
      );
    }
  }

  private parseDockerLogs(buffer: Buffer): string {
    const lines: string[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;
      const size = buffer.readUInt32BE(offset + 4);
      if (offset + 8 + size > buffer.length) break;
      const content = buffer.slice(offset + 8, offset + 8 + size).toString('utf8');
      lines.push(content.trimEnd());
      offset += 8 + size;
    }

    return lines.join('\n');
  }

  // ============================================================
  // Exec
  // ============================================================

  async execCommand(containerId: string, cmd: string[]): Promise<string> {
    const docker = await this.getDocker();

    const container = (docker as {
      getContainer: (id: string) => {
        exec: (opts: {
          Cmd: string[];
          AttachStdout: boolean;
          AttachStderr: boolean;
        }) => Promise<{
          start: (opts: object) => Promise<unknown>;
        }>;
      };
    }).getContainer(containerId);

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const streamObj = stream as unknown as NodeJS.ReadableStream;
      streamObj.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      streamObj.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(this.parseDockerLogs(buffer));
      });
      streamObj.on('error', reject);
    });
  }

  // ============================================================
  // Health Check
  // ============================================================

  async healthCheck(containerId: string): Promise<HealthCheckResult> {
    const checkedAt = new Date();

    try {
      const status = await this.getContainerStatus(containerId);

      if (status.state !== 'running') {
        return {
          healthy: false,
          checkedAt,
          gateway: { connected: false },
          container: { running: false },
          error: `Container is not running (state: ${status.state})`,
        };
      }

      const gatewayUrl = await this.getGatewayUrl(containerId);

      if (!gatewayUrl) {
        return {
          healthy: false,
          checkedAt,
          gateway: { connected: false },
          container: { running: true, uptime: status.uptime },
          error: 'Gateway port not mapped',
        };
      }

      let gatewayConnected = false;
      let gatewayLatency: number | undefined;

      try {
        const startTime = Date.now();
        const { default: WebSocket } = await import('ws');
        gatewayConnected = await new Promise<boolean>((resolve) => {
          const ws = new WebSocket(gatewayUrl);
          const timeout = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 5000);
          ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          });
          ws.on('error', () => {
            clearTimeout(timeout);
            resolve(false);
          });
        });
        gatewayLatency = Date.now() - startTime;
      } catch {
        gatewayConnected = false;
      }

      return {
        healthy: gatewayConnected,
        checkedAt,
        gateway: {
          connected: gatewayConnected,
          url: gatewayUrl,
          latency: gatewayLatency,
        },
        container: {
          running: true,
          uptime: status.uptime,
        },
        details: {
          resources: status.resources,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        checkedAt,
        gateway: { connected: false },
        container: { running: false },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================
  // Internal helpers (used by healthCheck)
  // ============================================================

  private async getContainerStatus(containerId: string): Promise<ContainerStatus> {
    const docker = await this.getDocker();

    try {
      const container = (docker as {
        getContainer: (id: string) => {
          inspect: () => Promise<{
            State: {
              Status: string;
              Running: boolean;
              Paused: boolean;
              StartedAt: string;
              FinishedAt: string;
              ExitCode: number;
              Error: string;
            };
            NetworkSettings: {
              Ports: Record<string, Array<{ HostPort: string }> | null>;
            };
          }>;
          stats: (opts: { stream: boolean }) => Promise<{
            cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
            precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
            memory_stats: { usage: number; limit: number };
          }>;
        };
      }).getContainer(containerId);

      const info = await container.inspect();
      const state = info.State;

      let containerState: ContainerState;
      if (state.Running) {
        containerState = state.Paused ? 'paused' : 'running';
      } else if (state.Status === 'created') {
        containerState = 'pending';
      } else if (state.ExitCode !== 0) {
        containerState = 'error';
      } else {
        containerState = 'stopped';
      }

      let uptime: number | undefined;
      if (state.Running && state.StartedAt) {
        const startTime = new Date(state.StartedAt).getTime();
        uptime = Math.floor((Date.now() - startTime) / 1000);
      }

      const ports: ContainerStatus['ports'] = [];
      const networkPorts = info.NetworkSettings.Ports || {};
      for (const [containerPort, hostBindings] of Object.entries(networkPorts)) {
        if (hostBindings) {
          const [port, protocol] = containerPort.split('/');
          for (const binding of hostBindings) {
            ports.push({
              containerPort: parseInt(port),
              hostPort: parseInt(binding.HostPort),
              protocol: protocol as 'tcp' | 'udp',
            });
          }
        }
      }

      let resources: ContainerStatus['resources'];
      if (state.Running) {
        try {
          const stats = await container.stats({ stream: false });
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

          resources = {
            cpuPercent: Math.round(cpuPercent * 100) / 100,
            memoryUsage: stats.memory_stats.usage,
            memoryLimit: stats.memory_stats.limit,
          };
        } catch {
          // Resource stats failure doesn't affect status
        }
      }

      return {
        containerId,
        state: containerState,
        uptime,
        startedAt: state.StartedAt ? new Date(state.StartedAt) : undefined,
        stoppedAt: state.FinishedAt && !state.Running ? new Date(state.FinishedAt) : undefined,
        resources,
        ports,
        exitCode: state.Running ? undefined : state.ExitCode,
        error: state.Error || undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('No such container')) {
        throw new OrchestratorError(
          'CONTAINER_NOT_FOUND',
          `Container ${containerId} not found`,
          containerId
        );
      }

      throw new OrchestratorError(
        'UNKNOWN_ERROR',
        `Failed to get container status: ${message}`,
        containerId,
        error as Error
      );
    }
  }

  private async getGatewayUrl(containerId: string): Promise<string | null> {
    try {
      const status = await this.getContainerStatus(containerId);

      const openclawProxyMapping = status.ports?.find(
        (p) => p.containerPort === OPENCLAW_GATEWAY_PROXY_PORT
      );
      if (openclawProxyMapping) {
        return `ws://localhost:${openclawProxyMapping.hostPort}`;
      }

      const gatewayPortMapping = status.ports?.find(
        (p) => p.containerPort === DEFAULT_GATEWAY_PORT
      );

      if (!gatewayPortMapping) {
        return null;
      }

      return `ws://localhost:${gatewayPortMapping.hostPort}`;
    } catch {
      return null;
    }
  }
}
