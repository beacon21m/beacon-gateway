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
  message: string;
}

export interface SseMessage {
  networkId: NetworkId;
  botId: BotId;
  botType: BotType;
  groupId?: string;
  userId?: string;
  replyMessageId?: string; // maps from POST.messageId
  message: string;
}

export interface EnvConfig {
  port: number;
  maxMessagesPerChannel: number;
  heartbeatMs: number;
}
