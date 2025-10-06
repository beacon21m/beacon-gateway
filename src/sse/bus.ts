import type { BotId, NetworkId, PostMessage, SseMessage } from "../types";

type ChannelKey = string; // `${networkId}/${botId}`

interface SseClient {
  send: (chunk: string) => void;
  close: () => void;
}

interface RingItem {
  id: number; // monotonic per channel
  payload: SseMessage;
}

class RingBuffer {
  private items: RingItem[] = [];
  private nextId = 1;
  constructor(private capacity: number) {}

  push(payload: SseMessage): RingItem {
    const item = { id: this.nextId++, payload };
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.shift();
    }
    return item;
  }

  // get items with id > lastId
  since(lastId: number | null): RingItem[] {
    if (lastId == null) return this.items.slice();
    return this.items.filter((i) => i.id > lastId);
  }
}

class Channel {
  readonly key: ChannelKey;
  private buffer: RingBuffer;
  private client: SseClient | null = null; // single subscriber

  constructor(networkId: NetworkId, botId: BotId, capacity: number) {
    this.key = `${networkId}/${botId}`;
    this.buffer = new RingBuffer(capacity);
  }

  publish(post: PostMessage) {
    const payload: SseMessage = {
      networkId: post.networkId,
      botId: post.botId,
      botType: post.botType,
      groupId: post.groupId,
      userId: post.userId,
      replyMessageId: post.messageId,
      message: post.message,
    };
    const item = this.buffer.push(payload);
    if (this.client) {
      const lines = [
        `id: ${item.id}`,
        `event: message`,
        `data: ${JSON.stringify(payload)}`,
        "\n",
      ];
      this.client.send(lines.join("\n"));
    }
    return item;
  }

  attach(client: SseClient, lastEventId: number | null) {
    // Close previous
    if (this.client) this.client.close();
    this.client = client;
    const backlog = this.buffer.since(lastEventId);
    for (const item of backlog) {
      const lines = [
        `id: ${item.id}`,
        `event: message`,
        `data: ${JSON.stringify(item.payload)}`,
        "\n",
      ];
      this.client.send(lines.join("\n"));
    }
  }

  detach(client: SseClient) {
    if (this.client === client) this.client = null;
  }
}

export class MessageBus {
  private channels = new Map<ChannelKey, Channel>();
  constructor(private capacity: number) {}

  private getChannel(networkId: NetworkId, botId: BotId): Channel {
    const key = `${networkId}/${botId}`;
    let ch = this.channels.get(key);
    if (!ch) {
      ch = new Channel(networkId, botId, this.capacity);
      this.channels.set(key, ch);
    }
    return ch;
  }

  publish(m: PostMessage) {
    return this.getChannel(m.networkId, m.botId).publish(m);
  }

  subscribe(
    networkId: NetworkId,
    botId: BotId,
    client: SseClient,
    lastEventId: number | null,
  ) {
    this.getChannel(networkId, botId).attach(client, lastEventId);
  }

  unsubscribe(networkId: NetworkId, botId: BotId, client: SseClient) {
    this.getChannel(networkId, botId).detach(client);
  }
}
