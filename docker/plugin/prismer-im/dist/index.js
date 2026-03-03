/**
 * Prismer IM Channel Plugin - Entry Point
 *
 * OpenClaw plugin for Prismer.AI IM Server integration.
 */
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { prismerIMPlugin } from "./src/channel.js";
import { setPrismerIMLogger } from "./src/runtime.js";
const plugin = {
    id: "prismer-im",
    name: "Prismer IM",
    description: "Connect to Prismer.AI Workspace via IM Server",
    configSchema: emptyPluginConfigSchema(),
    register(api) {
        // Set logger from api.logger (the correct interface)
        if (api.logger) {
            setPrismerIMLogger(api.logger);
        }
        else {
            console.log('[prismer-im] Warning: api.logger not available, using console');
        }
        // Register channel
        api.registerChannel({ plugin: prismerIMPlugin });
        api.logger?.info('[prismer-im] Channel registered');
    },
};
export default plugin;
