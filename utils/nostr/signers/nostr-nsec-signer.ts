import {
  nip19,
  nip44,
  getPublicKey,
  NostrEvent,
  finalizeEvent,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import CryptoJS from "crypto-js";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";

export type PassphraseResponse = {
  passphrase: string;
  remember: boolean;
};

export class NostrNSecSigner implements NostrSigner {
  private readonly encryptedPrivKey: string;
  private readonly challengeHandler: ChallengeHandler;

  public passphrase?: string;
  private pubkey?: string;
  private rememberedPassphrase?: string;
  private inputPassphrase?: string;
  private inputPassphraseClearer?: any;

  public static getEncryptedNSEC(
    privKey: Uint8Array | string,
    passphrase: string
  ): {
    encryptedPrivKey: string;
    passphrase: string;
    pubkey: string;
  } {
    if (typeof privKey !== "string" || !privKey.startsWith("nsec")) {
      if (typeof privKey === "string") privKey = hexToBytes(privKey);
      privKey = nip19.nsecEncode(privKey);
    }
    const pubkey = getPublicKey(
      nip19.decode(privKey as string).data as Uint8Array
    );

    privKey = CryptoJS.AES.encrypt(privKey as string, passphrase).toString();
    return {
      encryptedPrivKey: privKey as string,
      passphrase,
      pubkey,
    };
  }

  constructor(
    {
      encryptedPrivKey,
      passphrase,
      pubkey,
    }: {
      encryptedPrivKey: string;
      passphrase?: string;
      pubkey?: string;
    },
    challengeHandler: ChallengeHandler
  ) {
    this.encryptedPrivKey = encryptedPrivKey;
    this.challengeHandler = challengeHandler;
    this.pubkey = pubkey;
    this.passphrase = passphrase;
  }

  static fromJSON(
    json: {
      [key: string]: any;
    },
    challengeHandler: ChallengeHandler
  ): NostrNSecSigner | undefined {
    if (json.type !== "nsec" || !json.encryptedPrivKey) return undefined;
    return new NostrNSecSigner(
      {
        encryptedPrivKey: json.encryptedPrivKey,
        passphrase: json.passphrase,
        pubkey: json.pubkey,
      },
      challengeHandler
    );
  }

  public toJSON(): { [key: string]: any } {
    return {
      type: "nsec",
      encryptedPrivKey: this.encryptedPrivKey,
      pubkey: this.pubkey,
    };
  }

  public async connect(): Promise<string> {
    return "connected";
  }

  private async getPassphrase(
    abort: () => void,
    error?: Error
  ): Promise<[string, boolean]> {
    let passphrase: string | undefined = this.passphrase;
    let remind: boolean = false;
    if (!passphrase && this.rememberedPassphrase) {
      return [this.rememberedPassphrase, false];
    }
    if (!passphrase && this.inputPassphrase) {
      return [this.inputPassphrase, false];
    }
    if (!passphrase && this.challengeHandler) {
      const abortController = new AbortController();
      const res = await this.challengeHandler(
        "passphrase",
        "Enter passphrase",
        () => {
          abortController.abort();
          return abort();
        },
        abortController.signal,
        error
      );
      ({ res: passphrase, remind } = res);
    }
    if (!passphrase) passphrase = "";
    return [passphrase, remind];
  }

  public async _getPrivKey(): Promise<Uint8Array> {
    let error: Error | undefined;

    let aborted = false;
    do {
      try {
        const [passphrase, remember] = await this.getPassphrase(
          () => (aborted = true),
          error
        );

        const privkey = CryptoJS.AES.decrypt(
          this.encryptedPrivKey,
          passphrase
        ).toString(CryptoJS.enc.Utf8);
        if (!privkey) throw new Error("Invalid passphrase");

        const privKeyBytes: Uint8Array = privkey.startsWith("nsec")
          ? (nip19.decode(privkey).data as Uint8Array)
          : hexToBytes(privkey);

        if (remember) {
          this.rememberedPassphrase = passphrase;
        }

        // save input passphrase for few seconds, improve ux by not asking for passphrase again for multiple close actions
        if (this.inputPassphraseClearer)
          clearTimeout(this.inputPassphraseClearer);
        this.inputPassphraseClearer = setTimeout(() => {
          this.inputPassphrase = undefined;
        }, 5000);
        this.inputPassphrase = passphrase;

        return privKeyBytes;
      } catch (e) {
        console.error(e);
        error = e as Error;
      }
    } while (!aborted);
    throw new Error("Action cancelled by user");
  }

  public async _getNSec(): Promise<string> {
    const privKey = await this._getPrivKey();
    return nip19.nsecEncode(privKey);
  }

  public async getPubKey(): Promise<string> {
    if (this.pubkey) return this.pubkey;
    const privKey = await this._getPrivKey();
    this.pubkey = getPublicKey(privKey);
    return this.pubkey;
  }

  public async sign(event: NostrEventTemplate): Promise<NostrEvent> {
    const privKey = await this._getPrivKey();
    return finalizeEvent(event, privKey);
  }

  public async encrypt(pubkey: string, plainText: string): Promise<string> {
    const conversationKey = nip44.getConversationKey(
      await this._getPrivKey(),
      pubkey
    );
    return nip44.encrypt(plainText, conversationKey);
  }

  public async decrypt(pubkey: string, cipherText: string): Promise<string> {
    const conversationKey = nip44.getConversationKey(
      await this._getPrivKey(),
      pubkey
    );
    const decrypted = nip44.decrypt(cipherText, conversationKey);
    return decrypted;
  }

  public async close(): Promise<void> {
    this.rememberedPassphrase = undefined;
  }
}
