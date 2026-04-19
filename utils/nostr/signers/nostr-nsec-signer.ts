import {
  nip19,
  nip44,
  getPublicKey,
  NostrEvent,
  finalizeEvent,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import CryptoJS from "crypto-js";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import * as nip49 from "nostr-tools/nip49";
import { PassphraseSession } from "@/utils/nostr/signers/passphrase-session";

export type PassphraseResponse = {
  passphrase: string;
  remember: boolean;
};

export class NostrNSecSigner implements NostrSigner {
  private readonly encryptedPrivKey: string;
  private readonly challengeHandler: ChallengeHandler;
  private readonly passphraseSession: PassphraseSession;

  public passphrase?: string;
  private pubkey?: string;
  private isNip49Format: boolean = false;

  private async requestPassphraseWithChallenge(
    error?: Error
  ): Promise<PassphraseResponse> {
    if (!this.challengeHandler) {
      return { passphrase: "", remember: false };
    }

    return await new Promise((resolve, reject) => {
      const abortController = new AbortController();

      this.challengeHandler(
        "passphrase",
        "Enter passphrase",
        () => {
          abortController.abort();
          reject(new Error("Action cancelled by user"));
        },
        abortController.signal,
        error
      ).then(
        ({ res, remind }) => {
          resolve({
            passphrase: res,
            remember: remind,
          });
        },
        reject
      );
    });
  }

  public static getEncryptedNSEC(
    privKey: Uint8Array | string,
    passphrase: string
  ): {
    encryptedPrivKey: string;
    passphrase: string;
    pubkey: string;
  } {
    let secretKey: Uint8Array;
    if (typeof privKey === "string") {
      if (privKey.startsWith("nsec")) {
        secretKey = nip19.decode(privKey).data as Uint8Array;
      } else {
        secretKey = hexToBytes(privKey);
      }
    } else {
      secretKey = privKey;
    }

    const pubkey = getPublicKey(secretKey);
    const encryptedKey = nip49.encrypt(secretKey, passphrase);

    return {
      encryptedPrivKey: encryptedKey,
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
    this.isNip49Format = encryptedPrivKey.startsWith("ncryptsec");
    this.passphraseSession = new PassphraseSession(
      (error?: Error) => this.requestPassphraseWithChallenge(error),
      () => this.passphrase
    );
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

  public getEncryptedPrivKey(): string {
    return this.encryptedPrivKey;
  }

  public async connect(): Promise<string> {
    return "connected";
  }

  public async _getPrivKey(): Promise<Uint8Array> {
    let error: Error | undefined;

    let aborted = false;
    do {
      try {
        const [passphrase, remember] =
          await this.passphraseSession.getPassphrase(error);

        let privKeyBytes: Uint8Array;

        if (this.isNip49Format) {
          privKeyBytes = await nip49.decrypt(this.encryptedPrivKey, passphrase);
        } else {
          const privkey = CryptoJS.AES.decrypt(
            this.encryptedPrivKey,
            passphrase
          ).toString(CryptoJS.enc.Utf8);
          if (!privkey) throw new Error("Invalid passphrase");

          privKeyBytes = privkey.startsWith("nsec")
            ? (nip19.decode(privkey).data as Uint8Array)
            : hexToBytes(privkey);
        }

        this.passphraseSession.registerSuccessfulPassphrase(
          passphrase,
          remember
        );

        return privKeyBytes;
      } catch (e) {
        console.error(e);
        error = e as Error;
        aborted = error.message === "Action cancelled by user";
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
    this.passphraseSession.clearRememberedPassphrase();
  }
}
