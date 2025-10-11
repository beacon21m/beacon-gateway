import { AdaptorRegistry, type AdaptorRecord } from "../adaptors/registry";
import type { BotType } from "../types";

const ATTACH_PATH = "/api/attach" as const;
const LIST_PATH = "/api/adaptorIDs" as const;

type AttachBody = {
  networkId?: unknown;
  botId?: unknown;
  botType?: unknown;
  adaptorType?: unknown;
  metadata?: unknown;
};

function normalizeBotType(value: unknown): BotType | null {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  if (lowered === "brain" || lowered === "id") return lowered;
  return null;
}

function assertOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMetadata(value: unknown):
  | { ok: true; value?: Record<string, unknown> }
  | { ok: false } {
  if (value == null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false };
  return { ok: true, value: value as Record<string, unknown> };
}

function toResponsePayload(record: AdaptorRecord) {
  return {
    networkId: record.networkId,
    botId: record.botId,
    botType: record.botType,
    adaptorType: record.adaptorType,
    metadata: record.metadata,
    attachedAt: new Date(record.attachedAt).toISOString(),
    lastSeenAt: new Date(record.lastSeenAt).toISOString(),
  };
}

export function createAdaptorRoutes(registry: AdaptorRegistry) {
  return {
    attachPath: ATTACH_PATH,
    listPath: LIST_PATH,

    async attach(req: Request): Promise<Response> {
      let parsed: AttachBody;
      try {
        parsed = (await req.json()) as AttachBody;
      } catch (err) {
        console.warn("[api] attach invalid json", err);
        return new Response(JSON.stringify({ error: "invalid_json" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const networkIdVal = parsed.networkId ?? (parsed as any).networkID;
      const botIdVal = parsed.botId ?? (parsed as any).botID ?? (parsed as any).botid;
      const botTypeVal = parsed.botType ?? (parsed as any).bot_type;

      const networkId = typeof networkIdVal === "string" ? networkIdVal.trim() : "";
      const botId = typeof botIdVal === "string" ? botIdVal.trim() : "";
      const botType = normalizeBotType(botTypeVal);
      const adaptorType = assertOptionalString(parsed.adaptorType);
      const metadataResult = normalizeMetadata(parsed.metadata);
      if (!metadataResult.ok) {
        return new Response(JSON.stringify({ error: "invalid_field:metadata" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const metadata = metadataResult.value;

      if (!networkId) {
        return new Response(JSON.stringify({ error: "missing_field:networkId" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      if (!botId) {
        return new Response(JSON.stringify({ error: "missing_field:botId" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      if (!botType) {
        return new Response(JSON.stringify({ error: "invalid_field:botType" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const record = registry.attach({
        networkId,
        botId,
        botType,
        adaptorType,
        metadata,
      });

      console.log("[api] adaptor attached", {
        networkId,
        botId,
        botType,
        adaptorType,
      });

      return new Response(JSON.stringify({ status: "attached", adaptor: toResponsePayload(record) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },

    async list(): Promise<Response> {
      const records = registry.list().map(toResponsePayload);
      return new Response(JSON.stringify({ adaptors: records }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
