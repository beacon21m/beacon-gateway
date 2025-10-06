import { MessageBus } from "./sse/bus";
import type { EnvConfig } from "./types";
import { createMessageRoutes } from "./routes/messages";

const config: EnvConfig = {
  port: Number(process.env.PORT || 3030),
  maxMessagesPerChannel: Number(process.env.MAX_MESSAGES_PER_CHANNEL || 500),
  heartbeatMs: Number(process.env.HEARTBEAT_MS || 15000),
};

const bus = new MessageBus(config.maxMessagesPerChannel);
const routes = createMessageRoutes(bus);

const server = Bun.serve({
  port: config.port,
  fetch(req) {
    const url = new URL(req.url);

    // CORS preflight minimal
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type,last-event-id",
        },
      });
    }

    // POST /api/messages
    if (req.method === "POST" && url.pathname === routes.prefix) {
      return routes.post(req);
    }

    // GET /api/messages/:networkId/:botId
    if (
      req.method === "GET" &&
      url.pathname.startsWith(routes.prefix + "/")
    ) {
      const parts = url.pathname.split("/");
      if (parts.length >= 5) {
        return routes.sse(url, req);
      }
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(
  `beacon-gateway listening on http://localhost:${server.port} (SSE heartbeat ${config.heartbeatMs}ms)`,
);
