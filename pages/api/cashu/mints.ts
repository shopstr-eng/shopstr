import { relayInit } from "nostr-tools";

const getMint = () => {
  try {
    // const relayUrl = "wss://relayable.org";
    const mint = "https://8333.space:3338";
    return mint;
  } catch (error) {
    throw error;
  }
};

export default getMint;