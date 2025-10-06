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

      bus.publish(body);
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
      const networkId = url.pathname.split("/").at(-2)!;
      const botId = url.pathname.split("/").at(-1)!;

      const lastEventIdHeader = req.headers.get("last-event-id");
      const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : null;

      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          const encoder = new TextEncoder();
          const send = (text: string) => controller.enqueue(encoder.encode(text));
          const client = {
            send,
            close: () => controller.close(),
          };

          // initial retry and ack headers
          client.send(`retry: 3000\n\n`);
          bus.subscribe(networkId, botId, client, lastEventId);

          // heartbeat
          const heartbeatMs = Number(process.env.HEARTBEAT_MS || 15000);
          const interval = setInterval(() => client.send(`: ping\n\n`), heartbeatMs);

          const abort = (reason?: unknown) => {
            clearInterval(interval);
            bus.unsubscribe(networkId, botId, client);
            try {
              controller.close();
            } catch {}
          };

          (req.signal as AbortSignal).addEventListener("abort", () => abort());
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        },
      });
    },

    prefix,
  };
}
