import { Type } from "@sinclair/typebox";
import type { ChannelAgentTool } from "openclaw/plugin-sdk";
import { prismerFetch } from "./api-client.js";

/**
 * Create agent tools for Prismer context loading and document parsing.
 * These give OpenClaw agents web knowledge and document understanding.
 */
export function createPrismerAgentTools(apiKey: string, baseUrl: string): ChannelAgentTool[] {
  return [
    {
      name: "prismer_load",
      label: "Prismer Load",
      description:
        "Load web knowledge from URLs or search queries. Returns compressed, AI-ready context from web pages. Use this to fetch and understand web content.",
      parameters: Type.Object({
        input: Type.String({
          description: "URL, comma-separated URLs, or a search query",
        }),
        format: Type.Optional(
          Type.Union([Type.Literal("markdown"), Type.Literal("text")], {
            description: "Output format (default: markdown)",
          }),
        ),
        maxResults: Type.Optional(
          Type.Number({
            description: "Max results for search queries (default: 5)",
          }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const { input, format, maxResults } = args as {
          input: string;
          format?: string;
          maxResults?: number;
        };
        const body: Record<string, unknown> = { input };
        if (format) body.format = format;
        if (maxResults) body.maxResults = maxResults;

        try {
          const result = (await prismerFetch(apiKey, "/api/context/load", {
            method: "POST",
            body,
            baseUrl,
          })) as Record<string, unknown>;

          if (!result.success) {
            return {
              content: [{
                type: "text" as const,
                text: `Error: ${(result.error as Record<string, string>)?.message || "Load failed"}`,
              }],
            };
          }

          const results = (result.results || [result.result]) as Record<string, unknown>[];
          const texts = results.map((r) => {
            const title = r.title || r.url || "Untitled";
            const content = r.content || r.text || "";
            return `## ${title}\n\n${content}`;
          });

          return {
            content: [{ type: "text" as const, text: texts.join("\n\n---\n\n") }],
            details: result,
          };
        } catch (err) {
          return {
            content: [{
              type: "text" as const,
              text: `Failed: ${err instanceof Error ? err.message : String(err)}`,
            }],
          };
        }
      },
    },
    {
      name: "prismer_parse",
      label: "Prismer Parse",
      description:
        "Parse documents (PDF, images) using OCR. Extracts text content from document URLs.",
      parameters: Type.Object({
        url: Type.String({ description: "URL of the document to parse" }),
        mode: Type.Optional(
          Type.Union([Type.Literal("fast"), Type.Literal("hires")], {
            description: "Parse mode: fast (default) or hires (better quality)",
          }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const { url, mode } = args as { url: string; mode?: string };
        const body: Record<string, unknown> = { url };
        if (mode) body.mode = mode;

        try {
          const result = (await prismerFetch(apiKey, "/api/parse", {
            method: "POST",
            body,
            baseUrl,
          })) as Record<string, unknown>;

          if (!result.success) {
            return {
              content: [{
                type: "text" as const,
                text: `Error: ${(result.error as Record<string, string>)?.message || "Parse failed"}`,
              }],
            };
          }

          const data = result.result as Record<string, unknown> | undefined;
          const content = data?.content || data?.text || "";
          return {
            content: [{ type: "text" as const, text: String(content) }],
            details: result,
          };
        } catch (err) {
          return {
            content: [{
              type: "text" as const,
              text: `Failed: ${err instanceof Error ? err.message : String(err)}`,
            }],
          };
        }
      },
    },
  ];
}
