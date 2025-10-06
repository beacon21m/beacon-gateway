import { bytesToHex } from "nostr-tools/utils";
import { getPublicKey, nip19 } from "nostr-tools";

export function requireGatewayPrivKey(): string {
  const k = (process.env.GATEWAY_HEX_PRIV_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error("GATEWAY_HEX_PRIV_KEY must be 64-char hex");
  }
  return k.toLowerCase();
}

export function deriveGatewayKeys() {
  const sk = requireGatewayPrivKey();
  const pk = getPublicKey(sk);
  const pubkeyHex = typeof pk === "string" ? pk : bytesToHex(pk as unknown as Uint8Array);
  const npub = nip19.npubEncode(pubkeyHex);
  return { privkeyHex: sk, pubkeyHex, npub };
}

