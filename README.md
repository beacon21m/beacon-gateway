# beacon-gateway (server)

Lightweight Bun + TypeScript HTTP server that forwards inbound messages to remote Context VM (CVM) services and streams responses back via SSE.

- POST `/api/messages`
- GET `/api/messages/:networkId/:botId` (SSE)

See `docs/` for full API and design notes.

## Getting Started

1) Prereqs
- Install Bun: https://bun.sh

2) Configure environment
- From `server/`, copy the example env and adjust values:
  - `cp .env_example .env`
  - Edit `.env` to set your gateway key, CVM pubkeys, and relays.

3) Install and run
- `bun install`
- `bun run dev`
- Server logs: `beacon-gateway listening on http://localhost:3030 …`

4) Test locally
- Send a message
  - `curl -X POST http://localhost:3030/api/messages \`
    `-H 'content-type: application/json' \`
    `-d '{"networkId":"signal","botId":"123","botType":"brain","messageId":"abc","message":"hi"}'`
- Subscribe to the stream
  - `curl -N http://localhost:3030/api/messages/signal/123`

## Environment

- Basics: `PORT` (3030), `MAX_MESSAGES_PER_CHANNEL` (500), `HEARTBEAT_MS` (15000)

- CVM integration:
  - `GATEWAY_HEX_PRIV_KEY` – 64‑char hex private key to derive this gateway’s pubkey
  - `BRAIN_CVM_HEX_PUB` (or `BEACON_BRAIN_CVM_HEX_PUB`) – Brain CVM server pubkey (hex)
  - `ID_CVM_HEX_PUB` (or `BEACON_ID_CVM_HEX_PUB`) – ID CVM server pubkey (hex)
  - `CVM_RELAYS` – comma‑separated relay URLs, e.g. `wss://cvm.otherstuff.ai,wss://relay.contextvm.org`

Notes
- The gateway includes an internal MCP server to receive return tool calls from CVM (no public announcements, no key whitelist). It publishes received messages into the appropriate SSE channel.
- Outbound payloads include `botType` ("brain" | "id") so the value persists end‑to‑end.

## Using With Adaptors

- Build local adaptors that talk to this gateway’s HTTP endpoints. Examples: two WhatsApp clients or a Signal client.
- Each adaptor:
  - POSTs to `/api/messages` with its `networkId`, `botId`, `botType` (use the correct type for your target CVM), and `message`.
  - Subscribes to `GET /api/messages/:networkId/:botId` to receive responses over SSE.
- You can run multiple adaptors concurrently (e.g., two WhatsApp clients), each with distinct `botId`, and connect to both a remote Brain and ID server.

Scope and Repos
- Bot setup and adaptor implementations are separate from this gateway.
- New adaptor repos live under `beacon21m/adaptor_<type>`, e.g. `beacon21m/adaptor_whatsapp`, `beacon21m/adaptor_signal`.
