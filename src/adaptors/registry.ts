import type { BotType } from "../types";

export interface AttachAdaptorInput {
  networkId: string;
  botId: string;
  botType: BotType;
  adaptorType?: string;
  metadata?: Record<string, unknown>;
}

export interface AdaptorRecord extends AttachAdaptorInput {
  attachedAt: number;
  lastSeenAt: number;
}

export class AdaptorRegistry {
  private records = new Map<string, AdaptorRecord>();

  attach(input: AttachAdaptorInput): AdaptorRecord {
    const key = this.makeKey(input.networkId, input.botId, input.botType);
    const existing = this.records.get(key);
    const now = Date.now();
    const record: AdaptorRecord = {
      networkId: input.networkId,
      botId: input.botId,
      botType: input.botType,
      adaptorType: input.adaptorType,
      metadata: input.metadata ? { ...input.metadata } : undefined,
      attachedAt: existing?.attachedAt ?? now,
      lastSeenAt: now,
    };
    this.records.set(key, record);
    return record;
  }

  list(): AdaptorRecord[] {
    return Array.from(this.records.values()).sort((a, b) => {
      if (a.networkId !== b.networkId) return a.networkId.localeCompare(b.networkId);
      if (a.botType !== b.botType) return a.botType.localeCompare(b.botType);
      return a.botId.localeCompare(b.botId);
    });
  }

  private makeKey(networkId: string, botId: string, botType: BotType): string {
    return `${networkId}\u0000${botId}\u0000${botType}`;
  }
}
