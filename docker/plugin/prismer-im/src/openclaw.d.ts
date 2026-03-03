/**
 * Type declarations for OpenClaw plugin SDK
 *
 * These are minimal type definitions to allow TypeScript compilation.
 * The actual types come from the OpenClaw runtime at execution time.
 */

declare module 'openclaw/plugin-sdk' {
  /**
   * OpenClaw Plugin API passed to plugin.register()
   */
  export interface OpenClawPluginApi {
    /** Logger instance */
    logger?: {
      info: (...args: unknown[]) => void;
      debug: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    };
    /** Register a channel plugin */
    registerChannel: (opts: { plugin: unknown }) => void;
    /** Get configuration */
    getConfig?: () => unknown;
  }

  /**
   * Returns an empty schema for plugins that don't need config validation
   */
  export function emptyPluginConfigSchema(): object;
}
