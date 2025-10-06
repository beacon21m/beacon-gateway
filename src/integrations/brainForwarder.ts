import { deriveGatewayKeys } from "../crypto/keys";
import type { PostMessage } from "../types";
import { getClient } from "../cvm/client";
import type { ReceiveMessageRequest } from "../cvm/types";

function makeRequest(body: PostMessage): ReceiveMessageRequest {
  const { pubkeyHex } = deriveGatewayKeys();
  return {
    refId: crypto.randomUUID(),
    returnGatewayID: pubkeyHex,
    networkID: body.networkId,
    botid: body.botId,
    botType: body.botType,
    groupID: body.groupId,
    userId: body.userId,
    messageID: body.messageId,
    message: body.message,
  };
}

export async function forwardToCvm(body: PostMessage, options?: { await?: boolean }) {
  const target = body.botType; // 'brain' | 'id'
  const client = getClient(target);
  const req = makeRequest(body);
  const timeoutMs = Number(process.env.FORWARD_TIMEOUT_MS || 5000);
  console.log("[forward] -> CVM", { target, timeoutMs, req });
  const op = client
    .receiveMessage(req)
    .then((res) => {
      if (!res || res.status !== "success") {
        console.warn("[forward] result not success", { target, res });
      } else {
        console.log("[forward] result success", { target, description: res.description });
      }
      return res;
    })
    .catch((err) => {
      console.error("[forward] receiveMessage error", err);
      throw err;
    });

  const shouldAwait = options?.await ?? (String(process.env.FORWARD_AWAIT || "false").toLowerCase() === "true");
  if (!shouldAwait) {
    // fire-and-forget
    op.catch(() => {});
    return { status: "success", description: "forwarding" } as any;
  }
  const res = (await Promise.race([
    op,
    new Promise((_, rej) => setTimeout(() => rej(new Error("forward timeout")), timeoutMs)),
  ])) as any;
  return res;
}
