export type NetworkId = string;
export type BotId = string;

export type BotType = "brain" | "id";

export interface PostMessage {
  networkId: NetworkId;
  botId: BotId;
  botType: BotType;
  groupId?: string;
  userId?: string;
  messageId?: string; // incoming message id
  refId?: string; // optional CVM correlation id for outbound
  message: string;
}

export type Direction = "in" | "out";

export interface SseMessage {
  networkId: NetworkId;
  botId: BotId;
  botType: BotType;
  groupId?: string;
  userId?: string;
  replyMessageId?: string; // maps from POST.messageId
  refId?: string; // CVM correlation id if available (outbound)
  message: string;
  direction: Direction; // 'in' (received by gateway) or 'out' (sent from gateway)
  eventId?: number; // SSE event id (monotonic per channel)
}

export interface EnvConfig {
  port: number;
  maxMessagesPerChannel: number;
  heartbeatMs: number;
}
