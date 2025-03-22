import { nip19, NostrEvent } from "nostr-tools";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";
import {
  NostrSigner,
  ChallengeHandler,
} from "@/utils/nostr/signers/nostr-signer";

export class NostrNIP07Signer implements NostrSigner {
  constructor({}) {
    this.checkExtension();
  }

  public toJSON(): { [key: string]: any } {
    return {
      type: "nip07",
    };
  }

  private checkExtension(): any {
    if (!window?.nostr) throw new Error("Nostr extension not found");
    if (!window?.nostr?.nip44) {
      throw new Error(
        "Please use a NIP-44 compatible extension like Alby or nos2x",
      );
    }
  }

  public static fromJSON(
    json: { [key: string]: any },
    challengeHandler: ChallengeHandler,
  ): NostrNIP07Signer | undefined {
    if (json.type !== "nip07") return undefined;
    return new NostrNIP07Signer({});
  }

  public async connect(): Promise<string> {
    return "connected";
  }

  public async getPubKey(): Promise<string> {
    const pubkey = await window.nostr.getPublicKey();
    return pubkey;
  }

  public async sign(event: NostrEventTemplate): Promise<NostrEvent> {
    return await window.nostr.signEvent(event);
  }

  public async encrypt(pubkey: string, plainText: string): Promise<string> {
    return await window.nostr.nip44.encrypt(pubkey, plainText);
  }

  public async decrypt(pubkey: string, cipherText: string): Promise<string> {
    return await window.nostr.nip44.decrypt(pubkey, cipherText);
  }

  public async close(): Promise<void> {
    // noop
  }
}
