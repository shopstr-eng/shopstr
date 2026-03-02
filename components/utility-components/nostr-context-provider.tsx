import {
  createContext,
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";

const PassphraseChallengeModal = dynamic(
  () => import("@/components/utility-components/request-passphrase-modal"),
  { ssr: false }
);
const AuthUrlChallengeModal = dynamic(
  () => import("@/components/utility-components/auth-challenge-modal"),
  { ssr: false }
);
const MigrationPromptModal = dynamic(() => import("./migration-prompt-modal"), {
  ssr: false,
});

interface SignerContextInterface {
  signer?: NostrSigner;
  isLoggedIn?: boolean;
  pubkey?: string;
  npub?: string;
  newSigner?: (type: string, args: unknown) => Promise<NostrSigner>;
}

export const SignerContext = createContext({
  signer: {} as NostrSigner,
  isLoggedIn: false,
  pubkey: "",
  npub: "",
  newSigner: {},
} as SignerContextInterface);

interface NostrContextInterface {
  nostr?: NostrManager;
}

export const NostrContext = createContext({
  nostr: undefined,
} as NostrContextInterface);

type ChallengeResponse = { res: string; remind: boolean };

export function SignerContextProvider({ children }: { children: ReactNode }) {
  const [isPassphraseRequested, setIsPassphraseRequested] = useState(false);
  const [isAuthChallengeRequested, setIsAuthChallengeRequested] =
    useState(false);
  const [authUrl, setAuthUrl] = useState("");

  const [challengeResolver, setChallengeResolver] = useState<
    ((res: ChallengeResponse) => void) | undefined
  >(undefined);

  const [signer, setSigner] = useState<NostrSigner | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [abort, setAbort] = useState<() => void>(() => {});
  const [pubkey, setPubKey] = useState<string | undefined>(undefined);
  const [npub, setNPub] = useState<string | undefined>(undefined);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  const challengeHandler: ChallengeHandler = (
    type,
    challenge,
    abort,
    abortSignal,
    error
  ) => {
    return new Promise((resolve, _reject) => {
      setError(error);
      setAbort(() => abort);
      setChallengeResolver(() => {
        return (res: ChallengeResponse) => {
          resolve(res);
        };
      });
      switch (type) {
        case "passphrase": {
          setIsPassphraseRequested(true);
          abortSignal.addEventListener("abort", () => {
            setIsPassphraseRequested(false);
          });
          break;
        }
        case "auth_url": {
          setAuthUrl(challenge);
          setIsAuthChallengeRequested(true);
          abortSignal.addEventListener("abort", () => {
            setIsAuthChallengeRequested(false);
          });
          break;
        }
        default: {
          throw new Error("Unknown challenge type " + type);
        }
      }
    });
  };

  const loadKeys = async (signerObject: NostrSigner) => {
    try {
      const pubkey = await signerObject.getPubKey();
      const { nip19 } = await import("nostr-tools");
      const npub = nip19.npubEncode(pubkey);
      setPubKey(pubkey);
      setNPub(npub);
      setIsPassphraseRequested(false);
    } catch (error) {
      if (error instanceof Error && error.message.includes("passphrase")) {
        setIsPassphraseRequested(true);
      }
      setPubKey(undefined);
      setNPub(undefined);
    }
  };

  const loadSigner = useCallback(async () => {
    let existingSigner;
    const { signer, signInMethod } = getLocalStorageData();

    if (signer) {
      existingSigner = signer;
    } else if (signInMethod) {
      switch (signInMethod) {
        case "bunker": {
          let bunker =
            "bunker://" +
            getLocalStorageData().bunkerRemotePubkey +
            "?secret=" +
            getLocalStorageData().bunkerSecret;
          const bunkerRelays = getLocalStorageData().bunkerRelays;
          for (const relay of bunkerRelays!) {
            bunker += "&relay=" + relay;
          }
          const appPrivKey = getLocalStorageData().clientPrivkey;
          existingSigner = {
            type: "nip46",
            bunker,
            appPrivKey: appPrivKey!,
          };
          break;
        }
        case "extension": {
          existingSigner = {
            type: "nip07",
          };
          break;
        }
        case "nsec": {
          const encryptedPrivateKey = getLocalStorageData().encryptedPrivateKey;
          existingSigner = {
            type: "nsec",
            encryptedPrivKey: encryptedPrivateKey!,
          };
          break;
        }
        default: {
          throw new Error("Unknown signInMethod " + signInMethod);
        }
      }
    } else {
      setSigner(undefined);
      setPubKey(undefined);
      setNPub(undefined);
      return;
    }

    const signerData = existingSigner as { [key: string]: unknown };
    const [{ NostrNIP07Signer }, { NostrNSecSigner }, { NostrNIP46Signer }] =
      await Promise.all([
        import("@/utils/nostr/signers/nostr-nip07-signer"),
        import("@/utils/nostr/signers/nostr-nsec-signer"),
        import("@/utils/nostr/signers/nostr-nip46-signer"),
      ]);

    const signerObject =
      NostrNIP07Signer.fromJSON(signerData, challengeHandler) ??
      NostrNSecSigner.fromJSON(signerData, challengeHandler) ??
      NostrNIP46Signer.fromJSON(signerData, challengeHandler);
    if (!signerObject) return;

    setSigner(signerObject);
    loadKeys(signerObject);

    const isAlreadyLoaded = localStorage.getItem("signer");
    if (
      !isAlreadyLoaded ||
      JSON.stringify(existingSigner) !== isAlreadyLoaded
    ) {
      localStorage.setItem("signer", JSON.stringify(existingSigner));

      const shouldReloadSigner = false;
      window.dispatchEvent(
        new CustomEvent("storage", { detail: { shouldReloadSigner } })
      );
    }
  }, []);

  useEffect(() => {
    const handleStorage = (
      event: Event & { detail?: { shouldReloadSigner?: boolean } }
    ) => {
      if (event.detail?.shouldReloadSigner === false) return;
      void loadSigner();
    };

    window.addEventListener("storage", handleStorage);
    void loadSigner();

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadSigner]);

  useEffect(() => {
    setIsLoggedIn(!!(signer && pubkey));
  }, [signer, pubkey]);

  useEffect(() => {
    if (isLoggedIn) {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      void (async () => {
        const { needsMigration } = await import(
          "@/utils/nostr/encryption-migration"
        );
        if (!cancelled && needsMigration()) {
          timer = setTimeout(() => {
            setShowMigrationModal(true);
          }, 1000);
        }
      })();

      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }
    return undefined;
  }, [isLoggedIn]);

  const newSigner = useCallback(async (type: string, args: unknown) => {
    switch (type.toLowerCase()) {
      case "nip46": {
        const { NostrNIP46Signer } = await import(
          "@/utils/nostr/signers/nostr-nip46-signer"
        );
        return new NostrNIP46Signer(
          args as { bunker: string; appPrivKey?: Uint8Array },
          challengeHandler
        );
      }
      case "nsec": {
        const { NostrNSecSigner } = await import(
          "@/utils/nostr/signers/nostr-nsec-signer"
        );
        return new NostrNSecSigner(
          args as { encryptedPrivKey: string; passphrase?: string; pubkey?: string },
          challengeHandler
        );
      }
      default:
      case "nip07": {
        const { NostrNIP07Signer } = await import(
          "@/utils/nostr/signers/nostr-nip07-signer"
        );
        return new NostrNIP07Signer((args ?? {}) as Record<string, never>);
      }
    }
  }, []);

  return (
    <>
      <SignerContext.Provider
        value={{
          signer,
          isLoggedIn,
          pubkey,
          npub,
          newSigner,
        }}
      >
        <PassphraseChallengeModal
          actionOnSubmit={(passphrase: string, remind: boolean) => {
            if (challengeResolver) {
              challengeResolver({ res: passphrase, remind });
              if (signer) loadKeys(signer);
            }
          }}
          actionOnCancel={() => {
            if (abort) {
              abort();
            }
          }}
          error={error}
          isOpen={isPassphraseRequested}
          setIsOpen={setIsPassphraseRequested}
        />
        <AuthUrlChallengeModal
          actionOnCancel={() => {
            if (abort) {
              abort();
            }
          }}
          isOpen={isAuthChallengeRequested}
          setIsOpen={(value: boolean) => {
            setIsAuthChallengeRequested(value);
          }}
          error={error}
          challenge={authUrl}
        />
        <MigrationPromptModal
          isOpen={showMigrationModal}
          onClose={() => setShowMigrationModal(false)}
          onSuccess={() => {
            void loadSigner();
          }}
        />
        {children}
      </SignerContext.Provider>
    </>
  );
}

export function NostrContextProvider({ children }: { children: ReactNode }) {
  const [nostr] = useState<NostrManager>(() => new NostrManager());

  const reload = useCallback(() => {
    const { readRelays, writeRelays, relays } = getLocalStorageData();
    nostr.addRelays([...writeRelays, ...relays, ...readRelays]);
  }, [nostr]);

  useEffect(() => {
    reload();
    window.addEventListener("storage", reload);
    window.addEventListener("shopstr:storage", reload as EventListener);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("shopstr:storage", reload as EventListener);
    };
  }, [reload]);

  return (
    <>
      <NostrContext.Provider
        value={{
          nostr,
        }}
      >
        {children}
      </NostrContext.Provider>
    </>
  );
}
