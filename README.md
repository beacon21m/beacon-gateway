# beacon-gateway (server)

Lightweight Bun + TypeScript HTTP server that forwards inbound messages to remote Context VM (CVM) services and streams responses back via Server‑Sent Events (SSE). Adaptors (e.g., Signal/WhatsApp clients) POST inbound user messages here and subscribe to SSE streams for both inbound and outbound traffic.

Key endpoints
- POST `/api/messages` — submit an inbound message to the gateway (and forward to CVM)
- GET `/api/messages/:networkId/:botId` — SSE inbound stream (back‑compat alias of `.../in/...`)
- GET `/api/messages/in/:networkId/:botId` — SSE inbound stream (messages received by gateway)
- GET `/api/messages/out/:networkId/:botId` — SSE outbound stream (messages to send via adaptors)
- GET `/health` — basic liveness probe

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
  - Inbound: `curl -N http://localhost:3030/api/messages/in/signal/123`
  - Outbound: `curl -N http://localhost:3030/api/messages/out/signal/123`
  - Back-compat inbound: `curl -N http://localhost:3030/api/messages/signal/123`

## API Details

### POST /api/messages

Purpose
- Accepts an inbound message from an adaptor and forwards it to the appropriate CVM (Brain or ID). Also publishes the inbound message to the `in` SSE stream for observability.

Body (JSON)
- `networkId` string — e.g. `signal`, `whatsapp`
- `botId` string — adaptor‑specific bot or device identifier
- `botType` string — `brain` | `id` (selects target CVM)
- `groupId` string (optional)
- `userId` string (optional)
- `messageId` string (optional) — original incoming message id (used to correlate replies)
- `message` string — message content

Notes
- The server accepts both camelCase and CVM‑style legacy keys (e.g., `networkID`, `botid`, `groupID`, `messageID`).
- Required fields: `networkId`, `botId`, `botType`, `message`.

Responses
- 202 Accepted: `{ "status": "in_progress" }` when fire‑and‑forget forwarding is enabled (default, `FORWARD_AWAIT=false`).
- 200 OK: `{ "status": "accepted", "cvm": {...} }` if forwarding is awaited and CVM confirms success.
- 502/504: `{ "status": "rejected"|"error", ... }` if awaiting and CVM fails or times out.
- 400: `{ "error": "missing_field:<name>" | "invalid_field:botType" | "invalid_json" }` on validation errors.

Environment flags affecting behavior
- `FORWARD_AWAIT` (default `false`) — when `true`, the server waits for CVM `receiveMessage` to resolve and returns that status.
- `FORWARD_TIMEOUT_MS` (default `5000`) — timeout when awaiting a CVM response.

Example
```
curl -X POST http://localhost:3030/api/messages \
  -H 'content-type: application/json' \
  -d '{
        "networkId":"signal",
        "botId":"123",
        "botType":"brain",
        "messageId":"abc",
        "message":"hi there"
      }'
```

### SSE Streams (Inbound and Outbound)

Endpoints
- Inbound (received by gateway):
  - `GET /api/messages/:networkId/:botId` (back‑compat)
  - `GET /api/messages/in/:networkId/:botId`
- Outbound (to be sent by adaptors):
  - `GET /api/messages/out/:networkId/:botId`

Event format
- Content‑Type: `text/event-stream`
- Heartbeats: comment lines `: ping` at `HEARTBEAT_MS` (default 15000ms)
- Each message event:
  - `id: <monotonic-per-channel>`
  - `event: message`
  - `data: <JSON>` where JSON is:
    - `networkId` string
    - `botId` string
    - `botType` `brain` | `id`
    - `groupId?` string
    - `userId?` string
    - `replyMessageId?` string — set to the original `POST.messageId` when present
    - `message` string
    - `direction` `in` | `out`

Reconnection and backfill
- Clients may send `Last-Event-ID` (or `last-event-id`) to receive missed events since that id.
- Each `{networkId}/{botId}#in` and `{networkId}/{botId}#out` stream maintains a ring buffer (capacity `MAX_MESSAGES_PER_CHANNEL`, default 500).

CORS
- The server sets `access-control-allow-origin: *` for both POST and SSE to simplify adaptor integration.

Usage pattern for adaptors
- Listen on `/api/messages/out/:networkId/:botId` to receive messages your adaptor should deliver to the messaging network.
- POST delivery receipts or new inbound user messages to `/api/messages` so they flow to CVM and appear on `/in` for observability and correlation.

### Health

- `GET /health` → `{ "status": "ok" }` for simple liveness checks.

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

Security and limits
- This gateway is intended for trusted local adaptors or a controlled environment. Add authentication and stricter CORS if exposing beyond localhost.
- Rate limiting/throttling is not currently enforced; deploy behind an API gateway or add middleware if required.

## Using With Adaptors

- Build local adaptors that talk to this gateway’s HTTP endpoints. Examples: two WhatsApp clients or a Signal client.
- Each adaptor:
  - POSTs to `/api/messages` with its `networkId`, `botId`, `botType` (use the correct type for your target CVM), and `message`.
  - Subscribes to `GET /api/messages/out/:networkId/:botId` to receive outbound messages the adaptor should deliver. Optionally also subscribe to `.../in/...` for observability.
- You can run multiple adaptors concurrently (e.g., two WhatsApp clients), each with distinct `botId`, and connect to both a remote Brain and ID server.

Scope and Repos
- Bot setup and adaptor implementations are separate from this gateway.
- New adaptor repos live under `beacon21m/adaptor_<type>`, e.g. `beacon21m/adaptor_whatsapp`, `beacon21m/adaptor_signal`.
