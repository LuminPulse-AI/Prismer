import type { ChannelGatewayContext } from "openclaw/plugin-sdk";
import { prismerFetch } from "./api-client.js";
import type { CoreConfig, ResolvedPrismerAccount } from "./types.js";

/**
 * Register the agent on Prismer IM and start a WebSocket connection
 * for inbound messages.
 */
export async function startPrismerGateway(
  ctx: ChannelGatewayContext<ResolvedPrismerAccount>,
): Promise<{ stop: () => void }> {
  const account = ctx.account;

  if (!account.apiKey) {
    throw new Error(
      `Prismer is not configured for account "${account.accountId}" (need apiKey in channels.prismer).`,
    );
  }

  ctx.log?.info(
    `[${account.accountId}] registering agent on Prismer IM (${account.baseUrl})`,
  );

  // Self-register the agent
  let userId: string | undefined;
  let token: string | undefined;
  try {
    const regResult = (await prismerFetch(account.apiKey, "/api/im/register", {
      method: "POST",
      body: {
        username: account.agentName,
        displayName: account.agentName,
        isAgent: true,
      },
      baseUrl: account.baseUrl,
    })) as Record<string, unknown>;

    if (regResult.ok) {
      const data = regResult.data as Record<string, unknown> | undefined;
      userId = data?.userId as string | undefined;
      token = data?.token as string | undefined;
      ctx.log?.info(`[${account.accountId}] registered as user ${userId}`);
    }
  } catch (err) {
    ctx.log?.warn(
      `[${account.accountId}] registration warning: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Register agent capabilities
  if (userId) {
    try {
      await prismerFetch(account.apiKey, "/api/im/agents/register", {
        method: "POST",
        body: {
          name: account.agentName,
          description: account.description,
          agentType: "assistant",
          capabilities: account.capabilities.map((c) => ({ name: c })),
          protocolVersion: "1.0.0",
        },
        baseUrl: account.baseUrl,
      });
      ctx.log?.info(`[${account.accountId}] agent card registered`);
    } catch (err) {
      ctx.log?.warn(
        `[${account.accountId}] agent card warning: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Connect WebSocket for inbound messages
  let ws: WebSocket | null = null;
  let aborted = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  if (token) {
    const wsUrl = account.baseUrl.replace(/^http/, "ws").replace(/\/$/, "");
    const wsEndpoint = `${wsUrl}/api/im/ws?token=${token}`;

    const connect = () => {
      if (aborted) return;

      try {
        ws = new WebSocket(wsEndpoint);

        ws.onopen = () => {
          ctx.log?.info(`[${account.accountId}] WebSocket connected`);
          ctx.setStatus({
            accountId: account.accountId,
            running: true,
            connected: true,
            lastConnectedAt: Date.now(),
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data));
            if (data.type === "message" && data.payload) {
              handleInboundMessage(ctx, account, userId!, data.payload);
            }
          } catch (err) {
            ctx.log?.error(
              `[${account.accountId}] message parse error: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        };

        ws.onclose = () => {
          ctx.log?.info(`[${account.accountId}] WebSocket disconnected`);
          ctx.setStatus({
            accountId: account.accountId,
            running: !aborted,
            connected: false,
            lastStopAt: Date.now(),
          });
          if (!aborted) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };

        ws.onerror = (err) => {
          ctx.log?.error(`[${account.accountId}] WebSocket error: ${String(err)}`);
        };
      } catch (err) {
        ctx.log?.error(
          `[${account.accountId}] WebSocket connect error: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (!aborted) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      }
    };

    connect();
  }

  // Listen for abort signal
  ctx.abortSignal.addEventListener("abort", () => {
    aborted = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  });

  return {
    stop: () => {
      aborted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

function handleInboundMessage(
  ctx: ChannelGatewayContext<ResolvedPrismerAccount>,
  account: ResolvedPrismerAccount,
  selfUserId: string,
  msg: Record<string, unknown>,
): void {
  const senderId = msg.senderId as string;
  // Skip messages sent by self
  if (senderId === selfUserId) return;

  const content = msg.content as string;
  if (!content) return;

  const isGroup = (msg.conversationType as string) === "group";
  const messageId = msg.id as string;
  const senderName = (msg.senderName as string) || senderId;
  const conversationId = msg.conversationId as string;

  // Build MsgContext for OpenClaw's reply pipeline
  const msgCtx = {
    Body: content,
    From: senderId,
    To: isGroup ? conversationId : selfUserId,
    ChatType: isGroup ? "group" : "direct",
    Provider: "prismer",
    OriginatingChannel: "prismer",
    OriginatingTo: senderId,
    AccountId: account.accountId,
    MessageSid: messageId,
    SenderName: senderName,
    SenderId: senderId,
    Timestamp: Date.now(),
  };

  if (ctx.channelRuntime) {
    ctx.channelRuntime.reply
      .dispatchReplyWithBufferedBlockDispatcher({
        ctx: msgCtx,
        cfg: ctx.cfg,
        dispatcherOptions: {
          deliver: async (payload) => {
            const text = payload.text;
            if (!text) return;
            try {
              await prismerFetch(
                account.apiKey,
                `/api/im/direct/${senderId}/messages`,
                {
                  method: "POST",
                  body: { content: text },
                  baseUrl: account.baseUrl,
                },
              );
            } catch (err) {
              ctx.log?.error(
                `[${account.accountId}] reply send error: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          },
        },
      })
      .catch((err: unknown) => {
        ctx.log?.error(
          `[${account.accountId}] reply dispatch error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  } else {
    // Without channelRuntime, just log the message
    ctx.log?.info(
      `[${account.accountId}] inbound from ${senderName}: ${content.slice(0, 100)}`,
    );
  }
}
