function containsRelay(relays: string[], relay: string): boolean {
  return relays.some((r) => r.includes(relay));
}

export function getDefaultRelays(): string[] {
  return [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://purplepag.es",
    "wss://relay.primal.net",
    "wss://relay.nostr.band",
  ];
}

export function withBlastr(relays: string[]): string[] {
  const out = [...relays];

  const blastrRelay = "wss://sendit.nosflare.com";
  if (!containsRelay(out, blastrRelay)) {
    out.push(blastrRelay);
  }
  return out;
}
