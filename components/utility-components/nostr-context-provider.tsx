import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { nip19 } from "nostr-tools";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { isStoredSignerData } from "@/utils/nostr/nostr-helper-functions";
import PassphraseChallengeModal from "@/components/utility-components/request-passphrase-modal";
import AuthUrlChallengeModal from "@/components/utility-components/auth-challenge-modal";
import { NostrNIP07Signer } from "@/utils/nostr/signers/nostr-nip07-signer";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { needsMigration } from "@/utils/nostr/encryption-migration";
import MigrationPromptModal from "./migration-prompt-modal";
import { storage, STORAGE_KEYS } from "@/utils/storage";

interface SignerContextInterface {
  signer?: NostrSigner;
  isLoggedIn?: boolean;
  isAuthStateResolved?: boolean;
  pubkey?: string;
  npub?: string;
  newSigner?: (type: string, args: any) => NostrSigner;
}

export const SignerContext = createContext({
  signer: {} as NostrSigner,
  isLoggedIn: false,
  isAuthStateResolved: false,
  pubkey: "",
  npub: "",
  newSigner: {},
} as SignerContextInterface);

interface NostrContextInterface {
  nostr?: NostrManager;
}

export const NostrContext = createContext({
  nostr: {} as NostrManager,
} as NostrContextInterface);

export function SignerContextProvider({ children }: { children: ReactNode }) {
  const [isPassphraseRequested, setIsPassphraseRequested] = useState(false);
  const [isAuthChallengeRequested, setIsAuthChallengeRequested] =
    useState(false);
  const [authUrl, setAuthUrl] = useState("");

  const [challengeResolver, setChallengeResolver] = useState<
    ((res: any) => void) | undefined
  >(undefined);

  const [signer, setSigner] = useState<NostrSigner | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [abort, setAbort] = useState<() => void>(() => {});
  const [pubkey, setPubKey] = useState<string | undefined>(undefined);
  const [npub, setNPub] = useState<string | undefined>(undefined);
  const [isAuthStateResolved, setIsAuthStateResolved] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const isLoggedIn = !!(signer && pubkey);
  const lastSuccessfulSignerKeyRef = useRef<string>("");

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
        return async (res: any) => {
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
    } finally {
      setIsAuthStateResolved(true);
    }
  };

  const loadSigner = useCallback((retryCount = 0) => {
    let existingSigner;
    const signer = storage.getJson<any | undefined>(
      STORAGE_KEYS.SIGNER,
      undefined,
      { validate: isStoredSignerData }
    );
    const signInMethod = storage.getItem(STORAGE_KEYS.SIGN_IN_METHOD);

    if (signer) {
      existingSigner = signer;
    } else if (signInMethod) {
      switch (signInMethod) {
        case "bunker": {
          const remotePubkey = storage.getItem(
            STORAGE_KEYS.BUNKER_REMOTE_PUBKEY
          );
          const secret = storage.getItem(STORAGE_KEYS.BUNKER_SECRET);
          const bunkerRelays = storage.getJson<string[]>(
            STORAGE_KEYS.BUNKER_RELAYS,
            []
          );

          let bunker = "bunker://" + remotePubkey + "?secret=" + secret;
          for (const relay of bunkerRelays) {
            bunker += "&relay=" + relay;
          }
          const appPrivKey = storage.getItem(STORAGE_KEYS.CLIENT_PRIVKEY);
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
          const encryptedPrivateKey = storage.getItem(
            STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY
          );
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
      lastSuccessfulSignerKeyRef.current = "";
      setSigner(undefined);
      setPubKey(undefined);
      setNPub(undefined);
      setIsAuthStateResolved(true);
      return;
    }

    const signerKey = JSON.stringify(existingSigner);
    if (signerKey === lastSuccessfulSignerKeyRef.current) {
      return;
    }

    setIsAuthStateResolved(false);

    let signerObject: NostrSigner;
    try {
      signerObject = NostrManager.signerFrom(existingSigner!, challengeHandler);
    } catch {
      const isExtension =
        existingSigner?.type === "nip07" || signInMethod === "extension";
      if (isExtension && retryCount < 10) {
        setTimeout(() => loadSigner(retryCount + 1), 500);
      } else {
        setSigner(undefined);
        setPubKey(undefined);
        setNPub(undefined);
        setIsAuthStateResolved(true);
      }
      return;
    }

    if (!signerObject) return;

    lastSuccessfulSignerKeyRef.current = signerKey;
    setSigner(signerObject);
    loadKeys(signerObject);

    const isAlreadyLoaded = storage.getItem(STORAGE_KEYS.SIGNER);
    if (
      !isAlreadyLoaded ||
      JSON.stringify(existingSigner) !== isAlreadyLoaded
    ) {
      storage.setJson(STORAGE_KEYS.SIGNER, existingSigner);

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
      loadSigner();
    };

    window.addEventListener("storage", handleStorage);
    loadSigner();

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadSigner]);

  useEffect(() => {
    if (isLoggedIn) {
      const needsKeyMigration = needsMigration();
      if (needsKeyMigration) {
        const timer = setTimeout(() => {
          setShowMigrationModal(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [isLoggedIn]);

  const newSigner = useCallback((type: string, args: any) => {
    switch (type.toLowerCase()) {
      case "nip46": {
        return new NostrNIP46Signer(args, challengeHandler);
      }
      case "nsec": {
        return new NostrNSecSigner(args, challengeHandler);
      }
      default:
      case "nip07": {
        return new NostrNIP07Signer(args);
      }
    }
  }, []);

  return (
    <>
      <SignerContext.Provider
        value={{
          signer,
          isLoggedIn,
          isAuthStateResolved,
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
            loadSigner();
          }}
        />
        {children}
      </SignerContext.Provider>
    </>
  );
}

export function NostrContextProvider({ children }: { children: ReactNode }) {
  const [nostr] = useState<NostrManager>(new NostrManager());

  const reload = useCallback(() => {
    const readRelays = storage.getJson<string[]>(STORAGE_KEYS.READ_RELAYS, []);
    const writeRelays = storage.getJson<string[]>(
      STORAGE_KEYS.WRITE_RELAYS,
      []
    );
    const relays = storage.getJson<string[]>(STORAGE_KEYS.RELAYS, []);
    nostr.addRelays([...writeRelays, ...relays, ...readRelays]);
  }, [nostr]);

  reload();
  useEffect(() => {
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("storage", reload);
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
