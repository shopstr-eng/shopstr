import {
  nip44,
  getPublicKey,
  NostrEvent,
  finalizeEvent,
  generateSecretKey,
} from "nostr-tools";
import { newPromiseWithTimeout } from "@/utils/timeout";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { NostrEventTemplate, NostrManager } from "@/utils/nostr/nostr-manager";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import { v4 as uuidv4 } from "uuid";
type BunkerData = {
  url: string;
  bunkerPubkey: string;
  userPubkey: string;
  relayUrls: string[];
  secret?: string;
};

type Listener = {
  method: string;
  resolve: (value: NostrEvent) => void;
  reject: (reason: Error) => void;
};

export class NostrNIP46Signer implements NostrSigner {
  private readonly bunker: BunkerData;
  private readonly appPrivKey: Uint8Array;
  private readonly appPubKey: string;
  private readonly nostr: NostrManager;
  private readonly listeners: { [key: string]: Listener } = {};
  private readonly challengeHandler: ChallengeHandler;
  private readonly instanceId: string = uuidv4();
  private readonly pendingChallenges: Map<string, AbortController> = new Map();

  // used to increment the requestId
  private eventCounter: number = 0;

  constructor(
    {
      bunker,
      appPrivKey,
    }: {
      bunker: string;
      appPrivKey?: Uint8Array;
    },
    challengeHandler: ChallengeHandler
  ) {
    this.challengeHandler = challengeHandler;
    this.appPrivKey = appPrivKey ?? generateSecretKey();
    this.appPubKey = getPublicKey(this.appPrivKey);
    const url = bunker.replace("bunker://", "http://");
    const bunkerUrl = new URL(url);
    const bunkerPubkey =
      bunkerUrl.hostname || bunkerUrl.pathname?.replace(/^\/\//, "");
    const userPubkey = bunkerUrl.hostname;
    const relayUrls = bunkerUrl.searchParams.getAll("relay");
    const secret = bunkerUrl.searchParams.get("secret");

    if (!bunkerPubkey)
      throw new Error(
        "Invalid Bunker URL " + bunker + ": missing bunker pubkey"
      );
    if (!userPubkey)
      throw new Error("Invalid Bunker URL " + bunker + ": missing user pubkey");
    this.bunker = {
      url: bunker,
      bunkerPubkey,
      userPubkey,
      relayUrls,
      secret: secret || undefined,
    };

    this.nostr = new NostrManager(this.bunker.relayUrls);
    this.nostr.subscribe(
      [
        {
          kinds: [24133],
          since: Math.floor(Date.now() / 1000),
          authors: [this.bunker.bunkerPubkey],
          "#p": [this.appPubKey],
        },
      ],
      {
        onevent: (event) => {
          this.onEvent(event);
        },
      }
    );
  }

  public toJSON(): { [key: string]: any } {
    return {
      type: "nip46",
      bunker: this.bunker.url,
      appPrivKey: bytesToHex(this.appPrivKey),
    };
  }

  public static fromJSON(
    json: { [key: string]: any },
    challengeHandler: ChallengeHandler
  ): NostrNIP46Signer | undefined {
    if (json.type !== "nip46" || !json.bunker) return undefined;
    return new NostrNIP46Signer(
      {
        bunker: json.bunker,
        appPrivKey: hexToBytes(json.appPrivKey),
      },
      challengeHandler
    );
  }

  private async onEvent(event: NostrEvent) {
    const conversationKey = nip44.getConversationKey(
      this.appPrivKey,
      event.pubkey
    );
    event.content = nip44.decrypt(event.content, conversationKey);
    const content: any = JSON.parse(event.content);

    const id = content.id;
    const error = content.error;
    const result = content.result;
    if (!id) throw new Error("invalid event content");

    if (result === "auth_url") {
      const abortController = new AbortController();
      const abortSignal = abortController.signal;
      this.pendingChallenges.set(id, abortController);
      await this.challengeHandler(
        result,
        error,
        () => {
          abortController.abort();
          this.pendingChallenges.delete(id);
        },
        abortSignal
      );
      // we are going to receive
      // another ack event after the auth challenge is completed
      return;
    }

    const listener = this.listeners[id];

    if (!listener || listener.method !== "connect" || result === "ack") {
      const abortController = this.pendingChallenges.get(id);
      if (abortController) {
        abortController.abort();
        this.pendingChallenges.delete(id);
      }
    }

    if (!listener) return; // we are not listening for this event

    if (error) {
      listener.reject(new Error(error));
    } else {
      listener.resolve(event);
    }
  }

  public async connect() {
    const args: string[] = [];
    args.push(this.bunker.bunkerPubkey);
    args.push(this.bunker.secret || "");
    args.push(
      "sign_event:0,sign_event:5,sign_event:13,sign_event:1059,sign_event:1111,sign_event:4550,sign_event:7375,sign_event:7376,sign_event:10002,sign_event:17375,kind:30019,sign_event:30402,sign_event:30405,sign_event:30406,sign_event:31555,sign_event:31989,sign_event:31990,sign_event:34550,get_public_key,nip44_encrypt,nip44_decrypt"
    );
    return await this.sendRPC("connect", args);
  }

  public async close(): Promise<void> {
    this.nostr.close();
  }

  public async getPubKey(): Promise<string> {
    return await this.sendRPC("get_public_key", []);
  }

  public async sign(event: NostrEventTemplate): Promise<NostrEvent> {
    const signedEvent = await this.sendRPC("sign_event", [
      JSON.stringify(event),
    ]);
    return JSON.parse(signedEvent);
  }

  public async encrypt(pubkey: string, plainText: string): Promise<string> {
    return await this.sendRPC("nip44_encrypt", [pubkey, plainText]);
  }

  public async decrypt(pubkey: string, cipherText: string): Promise<string> {
    return await this.sendRPC("nip44_decrypt", [pubkey, cipherText]);
  }

  private getNewRequestId(): string {
    return "shp" + this.instanceId + this.eventCounter++;
  }

  private async waitForResponse(
    method: string,
    id: string
  ): Promise<NostrEvent> {
    return await newPromiseWithTimeout<NostrEvent>((resolve, reject) => {
      this.listeners[id] = {
        method,
        reject,
        resolve,
      };
    }).finally(() => {
      delete this.listeners[id];
    });
  }

  private async sendRPC(method: string, params: any): Promise<any> {
    const requestId = this.getNewRequestId();
    const remotePubKey = this.bunker.bunkerPubkey;

    const signEvent = {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify({
        id: requestId,
        method,
        params,
      }),
      tags: [["p", remotePubKey]],
    };

    const conversationKey = nip44.getConversationKey(
      this.appPrivKey,
      remotePubKey
    );
    signEvent.content = nip44.encrypt(signEvent.content, conversationKey);
    const signedEvent = finalizeEvent(signEvent, this.appPrivKey);

    // we need to start waiting for the response before we publish the event
    // to make sure we don't miss the response if it comes in before we have a chance to wait for it
    const respPromise: Promise<NostrEvent> = this.waitForResponse(
      method,
      requestId
    );

    await this.nostr.publish(signedEvent);

    const resp: NostrEvent = await respPromise; // now we wait for the response
    const content = JSON.parse(resp.content);
    return content.result;
  }
}
