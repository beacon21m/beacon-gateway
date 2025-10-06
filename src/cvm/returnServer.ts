import { Server as McpServer } from "@modelcontextprotocol/sdk/server";
import { ApplesauceRelayPool, NostrServerTransport, PrivateKeySigner } from "@contextvm/sdk";
import { z } from "zod";
import { parseRelays } from "./env";
import { deriveGatewayKeys } from "../crypto/keys";
import type { MessageBus } from "../sse/bus";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Mirror of ReceiveMessageRequest with optional botType for returns
const ReceiveMessageSchema = z.object({
  refId: z.string(),
  returnGatewayID: z.string(),
  networkID: z.string(),
  botid: z.string(),
  groupID: z.string().optional(),
  userId: z.string().optional(),
  messageID: z.string().optional(),
  message: z.string(),
  botType: z.enum(["brain", "id"]).optional(),
});

export async function startReturnCvmServer(bus: MessageBus) {
  const { privkeyHex, pubkeyHex } = deriveGatewayKeys();
  const relays = parseRelays(process.env.CVM_RELAYS);
  const signer = new PrivateKeySigner(privkeyHex);
  const relayPool = new ApplesauceRelayPool(relays);

  const transport = new NostrServerTransport({
    signer,
    relayHandler: relayPool,
    // Do not announce or whitelist (private, no allowedPublicKeys)
    isPublicServer: false,
  });

  const server = new McpServer({ name: "beacon-gateway-return-server", version: "1.0.0" });
  server.registerCapabilities({ tools: { listChanged: false } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      { name: "receiveMessage", description: "Receive processed message from CVM and forward to SSE stream" },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params as any;
    if (name !== "receiveMessage") {
      throw new McpError(ErrorCode.InvalidParams, `Tool ${name} not found`);
    }
    const a = ReceiveMessageSchema.parse(args);
    console.log("[cvm:return] receiveMessage", { target: pubkeyHex.slice(0, 8) + "…", a });
    const botType = a.botType ?? "brain";
    bus.publish({
      networkId: a.networkID,
      botId: a.botid,
      botType,
      groupId: a.groupID,
      userId: a.userId,
      messageId: a.messageID,
      message: a.message,
    });
    return { content: [] } as any;
  });

  await server.connect(transport);
  console.log(
    `[cvm:return] server ready <- ${pubkeyHex.slice(0, 8)}… via ${relays.join(",")}`,
  );
}
