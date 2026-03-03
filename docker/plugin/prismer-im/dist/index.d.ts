/**
 * Prismer IM Channel Plugin - Entry Point
 *
 * OpenClaw plugin for Prismer.AI IM Server integration.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: object;
    register(api: OpenClawPluginApi): void;
};
export default plugin;
export type { PrismerIMAccountConfig, ResolvedPrismerIMAccount, IMMessage, UIDirective, UIDirectiveType, SkillEvent, SkillEventPhase, SkillArtifact, ChannelStatusSnapshot, } from './src/types.js';
//# sourceMappingURL=index.d.ts.map