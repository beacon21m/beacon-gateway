import { Client as McpClient } from "@modelcontextprotocol/sdk/client";
import { ApplesauceRelayPool, NostrClientTransport, PrivateKeySigner } from "@contextvm/sdk";
import { parseRelays } from "./env";
import { deriveGatewayKeys } from "../crypto/keys";
import type { ReceiveMessageRequest, ReceiveMessageResponse } from "./types";

type Target = "brain" | "id";

function requiredHexEnv(name: string): string {
  // Accept both unprefixed and BEACON_ prefixed env names for convenience
  const candidates = [name, `BEACON_${name}`];
  const found = candidates
    .map((n) => (process.env[n] || "").trim())
    .find((v) => v.length > 0);
  if (!found || !/^[0-9a-fA-F]{64}$/.test(found)) {
    throw new Error(`${candidates.join(" or ")} must be 64-char hex`);
  }
  return found.toLowerCase();
}

class CvmClient {
  private mcp?: McpClient;
  private transport?: NostrClientTransport;
  private connected = false;
  constructor(private serverPubkey: string) {}

  async ensure(): Promise<void> {
    if (this.connected) return;
    const { privkeyHex } = deriveGatewayKeys();
    const signer = new PrivateKeySigner(privkeyHex);
    const relays = parseRelays(process.env.CVM_RELAYS);
    const relayPool = new ApplesauceRelayPool(relays);
    this.transport = new NostrClientTransport({ signer, relayHandler: relayPool, serverPubkey: this.serverPubkey });
    this.mcp = new McpClient({ name: "beacon-gateway-cvm-client", version: "1.0.0" });
    await this.mcp.connect(this.transport);
    this.connected = true;
    console.log(`[cvm] connected -> ${this.serverPubkey.slice(0,8)}… via ${relays.join(",")}`);
  }

  async receiveMessage(req: ReceiveMessageRequest): Promise<ReceiveMessageResponse> {
    await this.ensure();
    console.log("[cvm] send receiveMessage", { target: this.serverPubkey.slice(0,8)+"…", req });
    const res = (await this.mcp!.callTool({ name: "receiveMessage", arguments: req })) as ReceiveMessageResponse;
    console.log("[cvm] receiveMessage result", { res });
    return res;
  }

  async close() {
    await this.mcp?.close();
    this.connected = false;
  }
}

let brainClient: CvmClient | null = null;
let idClient: CvmClient | null = null;

export function getClient(target: Target): CvmClient {
  if (target === "brain") {
    if (!brainClient) brainClient = new CvmClient(requiredHexEnv("BRAIN_CVM_HEX_PUB"));
    return brainClient;
  }
  if (!idClient) idClient = new CvmClient(requiredHexEnv("ID_CVM_HEX_PUB"));
  return idClient;
}
