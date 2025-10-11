import { MessageBus } from "./sse/bus";
import type { EnvConfig } from "./types";
import { createMessageRoutes } from "./routes/messages";
import { startReturnCvmServer } from "./cvm/returnServer";
import { AdaptorRegistry } from "./adaptors/registry";
import { createAdaptorRoutes } from "./routes/adaptors";

const config: EnvConfig = {
  port: Number(process.env.PORT || 3030),
  maxMessagesPerChannel: Number(process.env.MAX_MESSAGES_PER_CHANNEL || 500),
  heartbeatMs: Number(process.env.HEARTBEAT_MS || 15000),
};

// Base URL for logs/clients; trimmed to avoid trailing slashes
const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost").replace(/\/+$/, "");

const bus = new MessageBus(config.maxMessagesPerChannel);
const routes = createMessageRoutes(bus);
const adaptorRegistry = new AdaptorRegistry();
const adaptorRoutes = createAdaptorRoutes(adaptorRegistry);

// Start CVM return server (no announce, no whitelist)
startReturnCvmServer(bus).catch((err) => {
  console.error("[cvm:return] failed to start", err);
});

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

    // POST /api/attach
    if (req.method === "POST" && url.pathname === adaptorRoutes.attachPath) {
      return adaptorRoutes.attach(req);
    }

    // GET /api/adaptorIDs
    if (req.method === "GET" && url.pathname === adaptorRoutes.listPath) {
      return adaptorRoutes.list();
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
  `beacon-gateway listening on ${API_BASE_URL}:${server.port} (SSE heartbeat ${config.heartbeatMs}ms)`,
);
