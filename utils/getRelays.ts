export default function getRelays(): string[] {
    return JSON.parse(localStorage.getItem('relays') || '["wss://relay.damus.io"]');
}
