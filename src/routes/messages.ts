import { MessageBus } from "../sse/bus";
import type { PostMessage, BotType } from "../types";
import { forwardToCvm } from "../integrations/brainForwarder";

export function createMessageRoutes(bus: MessageBus) {
  const prefix = "/api/messages";

  return {
    async post(req: Request): Promise<Response> {
      let body: PostMessage;
      try {
        const raw = (await req.json()) as any;
        // Normalize keys: accept both camelCase and CVM-style keys
        const normalized: any = {
          networkId: raw.networkId ?? raw.networkID,
          botId: raw.botId ?? raw.botid,
          botType: raw.botType,
          groupId: raw.groupId ?? raw.groupID,
          userId: raw.userId,
          messageId: raw.messageId ?? raw.messageID,
          message: raw.message,
        };
        body = normalized as PostMessage;
      } catch {
        return new Response(JSON.stringify({ error: "invalid_json" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      console.log("[api] POST /api/messages received", body);

      const required = ["networkId", "botId", "botType", "message"] as const;
      for (const k of required) {
        if (!body[k]) {
          console.warn("[api] validation missing field", k);
          return new Response(
            JSON.stringify({ error: `missing_field:${k}` }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
      }

      // validate botType enum
      const bt = (body.botType as string) as BotType;
      if (bt !== "brain" && bt !== "id") {
        console.warn("[api] invalid botType", body.botType);
        return new Response(
          JSON.stringify({ error: `invalid_field:botType` }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }

      // Record inbound message (received by the gateway)
      bus.publishInbound(body);
      const shouldAwait = String(process.env.FORWARD_AWAIT || "false").toLowerCase() === "true";
      if (!shouldAwait) {
        forwardToCvm(body, { await: false }).catch((err) => console.error("[cvm] forward error", err));
        return new Response(JSON.stringify({ status: "in_progress" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      // await confirmation from CVM before responding
      try {
        const res = await forwardToCvm(body, { await: true });
        const ok = res && res.status === "success";
        return new Response(JSON.stringify({ status: ok ? "accepted" : "rejected", cvm: res }), {
          status: ok ? 200 : 502,
          headers: { "content-type": "application/json" },
        });
      } catch (err) {
        console.error("[cvm] forward error", err);
        return new Response(JSON.stringify({ status: "error", error: String(err) }), {
          status: 504,
          headers: { "content-type": "application/json" },
        });
      }
    },

    async sse(url: URL, req: Request): Promise<Response> {
      const parts = url.pathname.split("/").filter(Boolean);
      // Supported paths:
      // - /api/messages/:networkId/:botId              (inbound, backward compatible)
      // - /api/messages/in/:networkId/:botId           (inbound)
      // - /api/messages/out/:networkId/:botId          (outbound)
      const idxApi = parts.indexOf("api");
      const idxMessages = parts.indexOf("messages", idxApi + 1);
      const after = parts.slice(idxMessages + 1);

      let streamKind: "in" | "out" = "in";
      let networkId: string;
      let botId: string;
      if (after.length === 2) {
        // /api/messages/:networkId/:botId
        [networkId, botId] = after;
        streamKind = "in";
      } else if (after.length === 3 && (after[0] === "in" || after[0] === "out")) {
        // /api/messages/(in|out)/:networkId/:botId
        streamKind = after[0] as any;
        networkId = after[1]!;
        botId = after[2]!;
      } else {
        return new Response("Not Found", { status: 404 });
      }

      const lastEventIdHeader = req.headers.get("last-event-id");
      const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : null;
      const heartbeatMs = Number(process.env.HEARTBEAT_MS || 15000);

      let abortStream: ((reason?: unknown) => void) | undefined;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          let interval: ReturnType<typeof setInterval> | undefined;
          let closed = false;
          let removeAbortListener: (() => void) | undefined;
          let client: { send: (chunk: string) => void; close: () => void } | undefined;

          const abort = (reason?: unknown) => {
            if (closed) return;
            closed = true;
            if (interval) clearInterval(interval);
            removeAbortListener?.();
            if (client) {
              if (streamKind === "in") {
                bus.unsubscribeInbound(networkId, botId, client);
              } else {
                bus.unsubscribeOutbound(networkId, botId, client);
              }
            }
            try {
              controller.close();
            } catch (err) {
              console.warn("[sse] failed to close controller", err);
            }
          };

          abortStream = abort;

          const send = (text: string) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(text));
            } catch (err) {
              console.warn("[sse] enqueue failed; tearing down stream", err);
              abort(err);
            }
          };

          client = {
            send,
            close: () => abort(),
          };

          // initial retry and ack headers
          send(`retry: 3000\n\n`);
          // Subscribe to inbound-only messages for this channel
          if (streamKind === "in") {
            bus.subscribeInbound(networkId, botId, client, lastEventId);
          } else {
            bus.subscribeOutbound(networkId, botId, client, lastEventId);
          }

          // heartbeat to keep intermediaries from idling the stream
          interval = setInterval(() => send(`: ping\n\n`), heartbeatMs);

          const signal = req.signal as AbortSignal | null;
          if (signal) {
            if (signal.aborted) {
              abort(signal.reason);
              return;
            }
            const onAbort = () => abort(signal.reason);
            signal.addEventListener("abort", onAbort);
            removeAbortListener = () => signal.removeEventListener("abort", onAbort);
          }
        },
        cancel(reason) {
          abortStream?.(reason);
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "keep-alive": `timeout=${Math.ceil((heartbeatMs * 3) / 1000)}, max=1000`,
          "x-accel-buffering": "no",
          "access-control-allow-origin": "*",
        },
      });
    },

    prefix,
  };
}
