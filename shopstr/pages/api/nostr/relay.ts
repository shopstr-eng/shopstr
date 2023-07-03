import { relayInit } from "nostr-tools";

const getRelay = () => {
  try {
    // const relayUrl = "wss://relayable.org";
    const relayUrl = "wss://relay.damus.io/";
    const relay = relayInit(relayUrl);
    return relay;
  } catch (error) {
    throw error;
  }
};

export default getRelay;
