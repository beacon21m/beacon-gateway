# beacon-gateway (server)

Lightweight Bun + TypeScript HTTP server exposing two endpoints:

- POST `/api/messages`
- GET `/api/messages/:networkId/:botId` (SSE)

See `docs/` for full API and design notes.

## Quick start

- Install Bun (https://bun.sh)
- From `server/`:
  - `bun install` (dev dep: typescript)
  - `bun run dev`
  - POST a message:
    ```sh
    curl -X POST http://localhost:3030/api/messages \
      -H 'content-type: application/json' \
      -d '{"networkId":"signal","botId":"123","botType":"brain","messageId":"abc","message":"hi"}'
    ```
  - Subscribe to SSE:
    ```sh
    curl -N http://localhost:3030/api/messages/signal/123
    ```

## Config

Env vars (all optional): `PORT` (3030), `MAX_MESSAGES_PER_CHANNEL` (500), `HEARTBEAT_MS` (15000).

Context VM envs (for upcoming integration):
- `GATEWAY_HEX_PRIV_KEY` – 64-char hex private key used to derive this gateway’s pubkey
- `BRAIN_CVM_HEX_PUB` (or `BEACON_BRAIN_CVM_HEX_PUB`) – hex pubkey of Beacon Brain server
- `ID_CVM_HEX_PUB` (or `BEACON_ID_CVM_HEX_PUB`) – hex pubkey of Beacon ID server
- `CVM_RELAYS` – comma-separated list of relays, e.g.
  - `CVM_RELAYS=wss://cvm.otherstuff.ai,wss://relay.contextvm.org`
