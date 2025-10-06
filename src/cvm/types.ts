export interface ReceiveMessageRequest {
  refId: string; // UUID
  returnGatewayID: string; // hex pubkey
  networkID: string;
  botid: string;
  groupID?: string;
  userId?: string;
  messageID?: string;
  message: string;
}

export interface ReceiveMessageResponse {
  status: "success" | "failure";
  description: string;
}

