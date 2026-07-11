import { finalizeEvent, generateSecretKey, nip44 } from "nostr-tools";
import type { NostrEvent } from "@/utils/types/types";

export type GiftWrapSigner = {
  encrypt(pubkey: string, content: string): string | Promise<string>;
  sign(event: {
    kind: number;
    tags: string[][];
    content: string;
    created_at: number;
  }): NostrEvent | Promise<NostrEvent>;
};

export async function createGiftWrapEvent(
  innerContent: string,
  recipientPubkey: string,
  options?: {
    randomPrivKey?: Uint8Array;
    signer?: GiftWrapSigner;
    relayHint?: string;
  }
): Promise<NostrEvent> {
  if (options?.randomPrivKey && options?.signer) {
    throw new Error(
      "createGiftWrapEvent: randomPrivKey and signer are mutually exclusive"
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const sealTimestamp = now - Math.floor(Math.random() * 172800);
  let encryptedSealContent: string;
  let signedSeal: NostrEvent;

  if (options?.randomPrivKey) {
    const conversationKey = nip44.getConversationKey(
      options.randomPrivKey,
      recipientPubkey
    );
    encryptedSealContent = nip44.encrypt(innerContent, conversationKey);
    signedSeal = finalizeEvent(
      {
        created_at: sealTimestamp,
        content: encryptedSealContent,
        kind: 13,
        tags: [],
      },
      options.randomPrivKey
    );
  } else if (options?.signer) {
    encryptedSealContent = await options.signer.encrypt(
      recipientPubkey,
      innerContent
    );
    signedSeal = await options.signer.sign({
      kind: 13,
      tags: [],
      content: encryptedSealContent,
      created_at: sealTimestamp,
    });
  } else {
    const randomPrivKey = generateSecretKey();
    const conversationKey = nip44.getConversationKey(
      randomPrivKey,
      recipientPubkey
    );
    encryptedSealContent = nip44.encrypt(innerContent, conversationKey);
    signedSeal = finalizeEvent(
      {
        created_at: sealTimestamp,
        content: encryptedSealContent,
        kind: 13,
        tags: [],
      },
      randomPrivKey
    );
  }

  const wrapPrivKey = generateSecretKey();
  const wrapConversationKey = nip44.getConversationKey(
    wrapPrivKey,
    recipientPubkey
  );
  const wrapContent = nip44.encrypt(
    JSON.stringify(signedSeal),
    wrapConversationKey
  );
  const wrapTimestamp = now - Math.floor(Math.random() * 172800);

  const wrapTags: string[][] = [
    options?.relayHint
      ? ["p", recipientPubkey, options.relayHint]
      : ["p", recipientPubkey],
  ];

  return finalizeEvent(
    {
      created_at: wrapTimestamp,
      content: wrapContent,
      kind: 1059,
      tags: wrapTags,
    },
    wrapPrivKey
  );
}
