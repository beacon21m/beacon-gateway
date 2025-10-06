export function parseRelays(input: string | undefined): string[] {
  if (!input) return ["wss://cvm.otherstuff.ai", "wss://relay.contextvm.org"]; // default two relays
  return input
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

