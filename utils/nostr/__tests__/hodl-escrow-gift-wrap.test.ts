import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  verifyEvent,
  type EventTemplate,
} from "nostr-tools";

// Only the relay/database send is stubbed. Everything that touches a key —
// createGiftWrapEvent, NIP-44, the seal signature — runs for real, because
// the point of this file is to prove the crypto path works rather than that
// the right mocks were called.
jest.mock("@/utils/nostr/gift-wrap", () => ({
  ...jest.requireActual("@/utils/nostr/gift-wrap"),
  sendGiftWrappedMessageEvent: jest.fn().mockResolvedValue(undefined),
}));

import { sendGiftWrappedMessageEvent } from "@/utils/nostr/gift-wrap";
import {
  HODL_ESCROW_GIFT_WRAP_KIND,
  buildHodlEscrowRumor,
  unwrapHodlEscrowRumors,
  wrapHodlEscrowRumor,
} from "@/utils/nostr/hodl-escrow-gift-wrap";
import {
  HODL_DISPUTE_EVENT_KIND,
  createHodlDisputeEventTemplate,
  fetchHodlDisputeEvents,
  publishHodlDisputeEvent,
} from "@/utils/nostr/hodl-escrow-records";
import type { NostrEvent } from "@/utils/nostr/nostr-manager";

const PAYMENT_HASH = "ab".repeat(32);
const DISPUTE_TEXT = "seller shipped an empty box, order never usable";

type Keypair = { privkey: Uint8Array; pubkey: string };

function keypair(): Keypair {
  const privkey = generateSecretKey();
  return { privkey, pubkey: getPublicKey(privkey) };
}

/** A real NIP-44/NIP-01 signer, the shape a browser NostrSigner provides. */
function signerFor(key: Keypair) {
  return {
    async encrypt(pubkey: string, plainText: string) {
      return nip44.encrypt(
        plainText,
        nip44.getConversationKey(key.privkey, pubkey)
      );
    },
    async decrypt(pubkey: string, cipherText: string) {
      return nip44.decrypt(
        cipherText,
        nip44.getConversationKey(key.privkey, pubkey)
      );
    },
    async sign(event: EventTemplate) {
      return finalizeEvent(event, key.privkey) as unknown as NostrEvent;
    },
  };
}

const disputer = keypair();
const arbiter = keypair();
const eavesdropper = keypair();

async function wrapDispute(
  options: { author?: Keypair; recipient?: Keypair; description?: string } = {}
) {
  const author = options.author ?? disputer;
  const recipient = options.recipient ?? arbiter;

  return wrapHodlEscrowRumor({
    template: createHodlDisputeEventTemplate({
      paymentHash: PAYMENT_HASH,
      arbiterPubkey: recipient.pubkey,
      description: options.description ?? DISPUTE_TEXT,
    }),
    authorPubkey: author.pubkey,
    recipientPubkey: recipient.pubkey,
    signer: signerFor(author),
  });
}

describe("NIP-59 wrapping of a hodl escrow dispute", () => {
  it("produces a kind 1059 signed by a throwaway key, not by the disputer", async () => {
    const wrap = await wrapDispute();

    expect(wrap.kind).toBe(HODL_ESCROW_GIFT_WRAP_KIND);
    expect(verifyEvent(wrap as never)).toBe(true);
    // The disputer's identity must not be the visible author, or the wrap
    // would announce who is fighting over an order just as loudly as the
    // plaintext event did.
    expect(wrap.pubkey).not.toBe(disputer.pubkey);
    expect(wrap.pubkey).not.toBe(arbiter.pubkey);
  });

  it("leaks nothing about the dispute to a relay", async () => {
    const wrap = await wrapDispute();
    const asSeenByRelay = JSON.stringify(wrap);

    expect(asSeenByRelay).not.toContain(DISPUTE_TEXT);
    expect(asSeenByRelay).not.toContain(PAYMENT_HASH);
    expect(asSeenByRelay).not.toContain(disputer.pubkey);
    expect(asSeenByRelay).not.toContain(String(HODL_DISPUTE_EVENT_KIND));
    // The arbiter's pubkey is the one thing left in the open: it is the `p`
    // tag recipients filter on, and NIP-59 keeps it there by design.
    expect(wrap.tags).toEqual([["p", arbiter.pubkey]]);
  });

  it("gives the arbiter back the dispute, author and all", async () => {
    const rumors = await unwrapHodlEscrowRumors({
      events: [await wrapDispute()],
      recipientPubkey: arbiter.pubkey,
      decryptor: signerFor(arbiter),
    });

    expect(rumors).toHaveLength(1);
    expect(rumors[0]!.kind).toBe(HODL_DISPUTE_EVENT_KIND);
    expect(rumors[0]!.pubkey).toBe(disputer.pubkey);
    expect(rumors[0]!.content).toBe(DISPUTE_TEXT);
    expect(rumors[0]!.tags).toEqual([
      ["d", PAYMENT_HASH],
      ["p", arbiter.pubkey],
    ]);
  });

  it("gives an unauthorized reader nothing", async () => {
    const wrap = await wrapDispute();

    await expect(
      unwrapHodlEscrowRumors({
        events: [wrap],
        recipientPubkey: eavesdropper.pubkey,
        decryptor: signerFor(eavesdropper),
      })
    ).resolves.toEqual([]);

    // Not merely filtered out by the `p` tag check — the bytes themselves do
    // not open with the wrong key.
    expect(() =>
      nip44.decrypt(
        wrap.content,
        nip44.getConversationKey(eavesdropper.privkey, wrap.pubkey)
      )
    ).toThrow();
  });

  it("does not let the disputer read their own wrap back", async () => {
    // Worth pinning down: NIP-44 conversation keys are symmetric between the
    // two parties, and the wrap key is ephemeral and discarded, so a sender
    // genuinely cannot reopen what they sent.
    await expect(
      unwrapHodlEscrowRumors({
        events: [await wrapDispute()],
        recipientPubkey: disputer.pubkey,
        decryptor: signerFor(disputer),
      })
    ).resolves.toEqual([]);
  });

  it("carries an unsigned rumor, so a decrypted dispute cannot be republished in the clear", async () => {
    const wrap = await wrapDispute();
    const rumors = await unwrapHodlEscrowRumors({
      events: [wrap],
      recipientPubkey: arbiter.pubkey,
      decryptor: signerFor(arbiter),
    });

    expect((rumors[0] as unknown as { sig?: string }).sig).toBeUndefined();
    expect(verifyEvent(rumors[0] as never)).toBe(false);
  });

  it("rejects a rumor attributed to a key that did not seal it", async () => {
    // The attack the rumor.pubkey === seal.pubkey check exists for: a seller
    // seals a rumor claiming to be from the buyer, so the arbiter sees a
    // dispute the buyer never raised.
    const forger = keypair();
    const forgedRumor = buildHodlEscrowRumor(
      createHodlDisputeEventTemplate({
        paymentHash: PAYMENT_HASH,
        arbiterPubkey: arbiter.pubkey,
        description: "I want a refund",
      }),
      disputer.pubkey
    );

    const { createGiftWrapEvent } = jest.requireActual(
      "@/utils/nostr/gift-wrap"
    );
    const wrap = await createGiftWrapEvent(
      JSON.stringify(forgedRumor),
      arbiter.pubkey,
      { signer: signerFor(forger) }
    );

    await expect(
      unwrapHodlEscrowRumors({
        events: [wrap],
        recipientPubkey: arbiter.pubkey,
        decryptor: signerFor(arbiter),
      })
    ).resolves.toEqual([]);
  });

  it("rejects a wrap whose own signature has been tampered with", async () => {
    const wrap = await wrapDispute();
    // Round-tripped through JSON first, the way an event actually arrives
    // from a relay: nostr-tools stamps a "already verified" symbol onto
    // events it finalized, and a plain spread would carry that along.
    const tampered = {
      ...(JSON.parse(JSON.stringify(wrap)) as NostrEvent),
      sig: "00".repeat(64),
    } as NostrEvent;

    await expect(
      unwrapHodlEscrowRumors({
        events: [tampered],
        recipientPubkey: arbiter.pubkey,
        decryptor: signerFor(arbiter),
      })
    ).resolves.toEqual([]);
  });

  it("keeps one bad wrap from hiding the rest", async () => {
    const good = await wrapDispute();
    const foreign = await wrapDispute({
      author: eavesdropper,
      recipient: eavesdropper,
    });
    // Addressed here, but sealed to somebody else's key.
    const undecryptable = {
      ...foreign,
      tags: [["p", arbiter.pubkey]],
    } as NostrEvent;

    const rumors = await unwrapHodlEscrowRumors({
      events: [undecryptable, good],
      recipientPubkey: arbiter.pubkey,
      decryptor: signerFor(arbiter),
    });

    expect(rumors.map((r) => r.pubkey)).toEqual([disputer.pubkey]);
  });

  it("bounds how many wraps a stranger can make it try to decrypt", async () => {
    const wraps = await Promise.all(
      Array.from({ length: 5 }, () => wrapDispute())
    );
    const decryptor = signerFor(arbiter);
    const counting = {
      decrypt: jest.fn((pubkey: string, text: string) =>
        decryptor.decrypt(pubkey, text)
      ),
    };

    const rumors = await unwrapHodlEscrowRumors({
      events: wraps,
      recipientPubkey: arbiter.pubkey,
      decryptor: counting,
      maxCandidates: 2,
    });

    expect(rumors).toHaveLength(2);
    // Two wraps, two decrypts each (wrap then seal). Nothing past the cap.
    expect(counting.decrypt).toHaveBeenCalledTimes(4);
  });
});

describe("the production dispute path, end to end", () => {
  beforeEach(() => {
    (sendGiftWrappedMessageEvent as jest.Mock).mockClear();
  });

  it("publishes a wrap the arbiter can read and nobody else can", async () => {
    // 1. publish — exactly what components/hodl/hodl-order-actions.tsx calls.
    await publishHodlDisputeEvent({
      paymentHash: PAYMENT_HASH,
      arbiterPubkey: arbiter.pubkey,
      disputerPubkey: disputer.pubkey,
      description: DISPUTE_TEXT,
      nostr: {} as never,
      signer: signerFor(disputer) as never,
    });

    const [, published] = (sendGiftWrappedMessageEvent as jest.Mock).mock
      .calls[0]!;
    expect(published.kind).toBe(HODL_ESCROW_GIFT_WRAP_KIND);
    expect(JSON.stringify(published)).not.toContain(DISPUTE_TEXT);
    expect(JSON.stringify(published)).not.toContain(PAYMENT_HASH);

    // 2. retrieve + 3. decrypt — what pages/disputes/index.tsx and
    // requireActionableDispute both do, differing only in whose key they use.
    const nostr = { fetch: jest.fn().mockResolvedValue([published]) };
    const disputes = await fetchHodlDisputeEvents({
      nostr: nostr as never,
      arbiterPubkey: arbiter.pubkey,
      decryptor: signerFor(arbiter),
    });

    // 4. validate — a parsed dispute the actionability gate can now weigh.
    expect(disputes).toHaveLength(1);
    expect(disputes[0]).toMatchObject({
      orderId: PAYMENT_HASH,
      authorPubkey: disputer.pubkey,
      description: DISPUTE_TEXT,
    });

    // The same fetch, run by anyone else, yields nothing at all.
    await expect(
      fetchHodlDisputeEvents({
        nostr: nostr as never,
        arbiterPubkey: eavesdropper.pubkey,
        decryptor: signerFor(eavesdropper),
      })
    ).resolves.toEqual([]);
  });

  it("still hands a stranger's dispute to the arbiter for authorization to reject", async () => {
    // Decryption is not authorization: anyone can address a wrap to a
    // published arbiter pubkey, and this layer is not the one that says no.
    const stranger = keypair();
    await publishHodlDisputeEvent({
      paymentHash: PAYMENT_HASH,
      arbiterPubkey: arbiter.pubkey,
      disputerPubkey: stranger.pubkey,
      description: "I demand this order be refunded",
      nostr: {} as never,
      signer: signerFor(stranger) as never,
    });

    const [, published] = (sendGiftWrappedMessageEvent as jest.Mock).mock
      .calls[0]!;
    const disputes = await fetchHodlDisputeEvents({
      nostr: { fetch: jest.fn().mockResolvedValue([published]) } as never,
      arbiterPubkey: arbiter.pubkey,
      decryptor: signerFor(arbiter),
    });

    expect(disputes[0]!.authorPubkey).toBe(stranger.pubkey);
    // No field claims a role. evaluateHodlDisputeActionability compares this
    // pubkey against the commitment row, and that is where it is refused.
    expect(Object.keys(disputes[0]!)).toEqual([
      "orderId",
      "authorPubkey",
      "description",
      "createdAt",
    ]);
  });
});
