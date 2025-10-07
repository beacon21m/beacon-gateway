import type { BotId, NetworkId, PostMessage, SseMessage, Direction } from "../types";

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
  private clients: Set<SseClient> = new Set(); // multi-subscriber

  constructor(networkId: NetworkId, botId: BotId, capacity: number, direction: Direction) {
    this.key = `${networkId}/${botId}#${direction}`;
    this.buffer = new RingBuffer(capacity);
  }

  publish(post: PostMessage, direction: Direction) {
    const payload: SseMessage = {
      networkId: post.networkId,
      botId: post.botId,
      botType: post.botType,
      groupId: post.groupId,
      userId: post.userId,
      replyMessageId: post.messageId,
      message: post.message,
      direction,
    };
    const item = this.buffer.push(payload);
    if (this.clients.size > 0) {
      const chunk = [
        `id: ${item.id}`,
        `event: message`,
        `data: ${JSON.stringify(payload)}`,
        "\n",
      ].join("\n");
      for (const c of this.clients) c.send(chunk);
    }
    return item;
  }

  attach(client: SseClient, lastEventId: number | null) {
    this.clients.add(client);
    const backlog = this.buffer.since(lastEventId);
    for (const item of backlog) {
      const chunk = [
        `id: ${item.id}`,
        `event: message`,
        `data: ${JSON.stringify(item.payload)}`,
        "\n",
      ].join("\n");
      client.send(chunk);
    }
  }

  detach(client: SseClient) {
    this.clients.delete(client);
  }
}

export class MessageBus {
  private channels = new Map<ChannelKey, Channel>();
  constructor(private capacity: number) {}

  private getChannel(networkId: NetworkId, botId: BotId, direction: Direction): Channel {
    const key = `${networkId}/${botId}#${direction}`;
    let ch = this.channels.get(key);
    if (!ch) {
      ch = new Channel(networkId, botId, this.capacity, direction);
      this.channels.set(key, ch);
    }
    return ch;
  }

  publishInbound(m: PostMessage) {
    return this.getChannel(m.networkId, m.botId, "in").publish(m, "in");
  }

  publishOutbound(m: PostMessage) {
    return this.getChannel(m.networkId, m.botId, "out").publish(m, "out");
  }

  subscribeInbound(
    networkId: NetworkId,
    botId: BotId,
    client: SseClient,
    lastEventId: number | null,
  ) {
    this.getChannel(networkId, botId, "in").attach(client, lastEventId);
  }

  unsubscribeInbound(networkId: NetworkId, botId: BotId, client: SseClient) {
    this.getChannel(networkId, botId, "in").detach(client);
  }

  subscribeOutbound(
    networkId: NetworkId,
    botId: BotId,
    client: SseClient,
    lastEventId: number | null,
  ) {
    this.getChannel(networkId, botId, "out").attach(client, lastEventId);
  }

  unsubscribeOutbound(networkId: NetworkId, botId: BotId, client: SseClient) {
    this.getChannel(networkId, botId, "out").detach(client);
  }
}
