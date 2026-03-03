/**
 * Prismer IM Channel Plugin - Entry Point
 *
 * OpenClaw plugin for Prismer.AI IM Server integration.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { prismerIMPlugin } from "./src/channel.js";
import { setPrismerIMLogger } from "./src/runtime.js";

const plugin = {
  id: "prismer-im",
  name: "Prismer IM",
  description: "Connect to Prismer.AI Workspace via IM Server",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    // Set logger from api.logger (the correct interface)
    if (api.logger) {
      setPrismerIMLogger(api.logger);
    } else {
      console.log('[prismer-im] Warning: api.logger not available, using console');
    }

    // Register channel
    api.registerChannel({ plugin: prismerIMPlugin });
    api.logger?.info('[prismer-im] Channel registered');
  },
};

export default plugin;

// Re-export types for consumers
export type {
  PrismerIMAccountConfig,
  ResolvedPrismerIMAccount,
  IMMessage,
  UIDirective,
  UIDirectiveType,
  SkillEvent,
  SkillEventPhase,
  SkillArtifact,
  ChannelStatusSnapshot,
} from './src/types.js';
