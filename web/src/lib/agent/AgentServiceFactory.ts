/**
 * Agent Service Factory
 *
 * @description
 * Phase 3A: Agent Service Factory
 * Creates the appropriate Agent service instance based on configuration
 */

import type {
  AgentService,
  AgentServiceFactoryConfig,
  CreateServiceOptions,
} from './types';
import { DemoAgentService } from './DemoAgentService';
import { OpenClawAgentService, type OpenClawConfig } from './OpenClawAgentService';

// ============================================================
// Factory Implementation
// ============================================================

/**
 * Agent Service Factory
 *
 * @description
 * Creates DemoAgentService or OpenClawAgentService instances based on configuration.
 * Supports singleton pattern and on-demand creation.
 */
export class AgentServiceFactory {
  private static instance: AgentServiceFactory | null = null;
  private config: AgentServiceFactoryConfig;
  private services: Map<string, AgentService> = new Map();

  private constructor(config: AgentServiceFactoryConfig) {
    this.config = config;
  }

  /**
   * Get factory singleton
   */
  static getInstance(config?: AgentServiceFactoryConfig): AgentServiceFactory {
    if (!AgentServiceFactory.instance) {
      if (!config) {
        // Default configuration
        config = {
          defaultType: 'demo',
          demo: {
            simulatedDelay: 1000,
            enableDemoFlow: true,
          },
        };
      }
      AgentServiceFactory.instance = new AgentServiceFactory(config);
    }
    return AgentServiceFactory.instance;
  }

  /**
   * Reset factory (for testing)
   */
  static reset(): void {
    if (AgentServiceFactory.instance) {
      AgentServiceFactory.instance.disposeAll();
      AgentServiceFactory.instance = null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgentServiceFactoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create service instance
   */
  createService(options: CreateServiceOptions): AgentService {
    const serviceType = options.type ?? this.config.defaultType;
    const serviceKey = `${serviceType}-${options.agentId}`;

    // Check if an instance already exists
    const existing = this.services.get(serviceKey);
    if (existing) {
      return existing;
    }

    // Create new instance
    let service: AgentService;

    if (serviceType === 'demo') {
      service = new DemoAgentService(this.config.demo);
    } else if (serviceType === 'openclaw') {
      const gatewayUrl = options.gatewayUrl ?? this.config.openclaw?.gatewayUrl;
      if (!gatewayUrl) {
        throw new Error('Gateway URL required for OpenClaw service');
      }

      service = new OpenClawAgentService({
        gatewayUrl,
        authToken: this.config.openclaw?.authToken,
        timeout: this.config.openclaw?.timeout,
        retryCount: this.config.openclaw?.retryCount,
      });
    } else {
      throw new Error(`Unknown service type: ${serviceType}`);
    }

    this.services.set(serviceKey, service);
    return service;
  }

  /**
   * Get existing service instance
   */
  getService(agentId: string, type?: 'demo' | 'openclaw'): AgentService | null {
    const serviceType = type ?? this.config.defaultType;
    return this.services.get(`${serviceType}-${agentId}`) ?? null;
  }

  /**
   * Get or create service instance
   */
  getOrCreateService(options: CreateServiceOptions): AgentService {
    const existing = this.getService(options.agentId, options.type);
    if (existing) {
      return existing;
    }
    return this.createService(options);
  }

  /**
   * Remove service instance
   */
  removeService(agentId: string, type?: 'demo' | 'openclaw'): void {
    const serviceType = type ?? this.config.defaultType;
    const serviceKey = `${serviceType}-${agentId}`;
    const service = this.services.get(serviceKey);

    if (service && 'dispose' in service) {
      (service as { dispose: () => void }).dispose();
    }

    this.services.delete(serviceKey);
  }

  /**
   * Dispose all services
   */
  disposeAll(): void {
    for (const service of this.services.values()) {
      if ('dispose' in service) {
        (service as { dispose: () => void }).dispose();
      }
    }
    this.services.clear();
  }

  /**
   * Get all active services
   */
  getActiveServices(): { agentId: string; type: string; service: AgentService }[] {
    const result: { agentId: string; type: string; service: AgentService }[] = [];

    for (const [key, service] of this.services) {
      const [type, agentId] = key.split('-');
      result.push({ agentId, type, service });
    }

    return result;
  }

  /**
   * Health check all services
   */
  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [key, service] of this.services) {
      try {
        const healthy = await service.healthCheck();
        results.set(key, healthy);
      } catch {
        results.set(key, false);
      }
    }

    return results;
  }
}

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Get default Agent service
 */
export function getAgentService(options: CreateServiceOptions): AgentService {
  return AgentServiceFactory.getInstance().getOrCreateService(options);
}

/**
 * Create Demo Agent service
 */
export function createDemoService(
  agentId: string,
  config?: { simulatedDelay?: number; enableDemoFlow?: boolean }
): AgentService {
  return AgentServiceFactory.getInstance().createService({
    type: 'demo',
    agentId,
  });
}

/**
 * Create OpenClaw Agent service
 */
export function createOpenClawService(
  agentId: string,
  gatewayUrl: string,
  config?: Partial<OpenClawConfig>
): AgentService {
  const factory = AgentServiceFactory.getInstance();
  factory.updateConfig({
    openclaw: {
      gatewayUrl,
      ...config,
    },
  });

  return factory.createService({
    type: 'openclaw',
    agentId,
    gatewayUrl,
  });
}

/**
 * Automatically select service type based on environment
 */
export function createAgentService(
  agentId: string,
  gatewayUrl?: string
): AgentService {
  // If a Gateway URL is provided, use OpenClaw
  if (gatewayUrl) {
    return createOpenClawService(agentId, gatewayUrl);
  }

  // Check environment variables
  const envGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  if (envGatewayUrl) {
    return createOpenClawService(agentId, envGatewayUrl);
  }

  // Default to Demo service
  return createDemoService(agentId);
}
