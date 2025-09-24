import { NostrEventTemplate, NostrEvent } from "@/utils/nostr/nostr-manager";

export interface NostrSigner {
  connect(): Promise<string | Record<string, unknown>>;
  getPubKey(): Promise<string>;
  sign(event: NostrEventTemplate): Promise<NostrEvent>;
  encrypt(pubkey: string, plainText: string): Promise<string>;
  decrypt(pubkey: string, cipherText: string): Promise<string>;
  close(): Promise<void>;
  toJSON(): Record<string, unknown>;
}

export type ChallengeHandler = (
  type: string,
  challenge: string,
  abort: () => void,
  abortSignal: AbortSignal,
  lastError?: Error
) => Promise<{
  res: string;
  remind: boolean;
}>;
