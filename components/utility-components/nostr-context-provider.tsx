import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import {
  clearNWCConnection,
  getLocalStorageData,
  getPersistableSignerData,
  getStoredReadRelays,
  getStoredRelays,
  getStoredWriteRelays,
  lockNWCConnection,
  saveEncryptedNIP46Signer,
  saveEncryptedNWCString,
  saveNWCInfo,
  type StoredSignerData,
  unlockNWCString,
} from "@/utils/nostr/nostr-helper-functions";
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

interface NWCContextInterface {
  nwcString?: string | null;
  legacyNWCString?: string | null;
  nwcInfo?: Record<string, any> | null;
  hasStoredConnection?: boolean;
  hasLegacyConnection?: boolean;
  isUnlocked?: boolean;
  saveConnection?: (
    nwcString: string,
    info: Record<string, any>,
    passphrase: string
  ) => Promise<void>;
  ensureUnlocked?: () => Promise<string>;
  lockConnection?: () => void;
  removeConnection?: () => void;
}

export const NostrContext = createContext({
  nostr: {} as NostrManager,
} as NostrContextInterface);

export const NWCContext = createContext({
  nwcString: null,
  legacyNWCString: null,
  nwcInfo: null,
  hasStoredConnection: false,
  hasLegacyConnection: false,
  isUnlocked: false,
  saveConnection: async () => {},
  ensureUnlocked: async () => "",
  lockConnection: () => {},
  removeConnection: () => {},
} as NWCContextInterface);

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
  const legacyNIP46MigrationRequestedRef = useRef(false);

  const challengeHandler = useCallback<ChallengeHandler>(
    (type, challenge, abort, abortSignal, error) => {
      return new Promise((resolve, reject) => {
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
            abortSignal.addEventListener(
              "abort",
              () => {
                setIsPassphraseRequested(false);
                reject(new Error("Action cancelled by user"));
              },
              { once: true }
            );
            break;
          }
          case "auth_url": {
            setAuthUrl(challenge);
            setIsAuthChallengeRequested(true);
            abortSignal.addEventListener(
              "abort",
              () => {
                setIsAuthChallengeRequested(false);
                reject(new Error("Action cancelled by user"));
              },
              { once: true }
            );
            break;
          }
          default: {
            throw new Error("Unknown challenge type " + type);
          }
        }
      });
    },
    []
  );

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

  const loadSigner = useCallback(
    (retryCount = 0) => {
      let existingSigner: StoredSignerData | undefined;
      const { signer, signInMethod, hasLegacyNIP46Connection } =
        getLocalStorageData();

      if (signer) {
        existingSigner = signer;
      } else if (signInMethod) {
        switch (signInMethod) {
          case "bunker": {
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

      if (!existingSigner) {
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
        signerObject = NostrManager.signerFrom(
          existingSigner! as { [key: string]: string },
          challengeHandler
        );
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

      if (
        hasLegacyNIP46Connection &&
        existingSigner &&
        existingSigner.type === "nip46" &&
        "bunker" in existingSigner &&
        typeof existingSigner.bunker === "string" &&
        "appPrivKey" in existingSigner &&
        typeof existingSigner.appPrivKey === "string" &&
        !legacyNIP46MigrationRequestedRef.current
      ) {
        const legacySigner = {
          type: "nip46" as const,
          bunker: existingSigner.bunker,
          appPrivKey: existingSigner.appPrivKey,
        };
        legacyNIP46MigrationRequestedRef.current = true;
        void (async () => {
          let migrationError: Error | undefined;
          let aborted = false;
          do {
            try {
              const abortController = new AbortController();
              const response = await challengeHandler(
                "passphrase",
                "Create a passphrase to protect your NIP-46 connection",
                () => {
                  aborted = true;
                  abortController.abort();
                },
                abortController.signal,
                migrationError
              );
              await saveEncryptedNIP46Signer(legacySigner, response.res);
              setIsPassphraseRequested(false);
              return;
            } catch (caughtError) {
              migrationError = caughtError as Error;
            }
          } while (!aborted);
        })();
      } else if (!hasLegacyNIP46Connection) {
        legacyNIP46MigrationRequestedRef.current = false;
      }

      const isAlreadyLoaded = storage.getItem(STORAGE_KEYS.SIGNER);
      const isRuntimeNIP46Signer =
        existingSigner.type === "nip46" && "bunker" in existingSigner;
      const persistableSigner = isRuntimeNIP46Signer
        ? undefined
        : getPersistableSignerData(existingSigner);
      const serializedSigner = persistableSigner
        ? JSON.stringify(persistableSigner)
        : "";
      const hasStorageMismatch =
        Boolean(persistableSigner) &&
        (!isAlreadyLoaded || serializedSigner !== isAlreadyLoaded);

      if (persistableSigner && hasStorageMismatch) {
        storage.setJson(STORAGE_KEYS.SIGNER, persistableSigner);
      }

      if (hasStorageMismatch) {
        const shouldReloadSigner = false;
        window.dispatchEvent(
          new CustomEvent("storage", { detail: { shouldReloadSigner } })
        );
      }
    },
    [challengeHandler]
  );

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
    const readRelays = getStoredReadRelays();
    const writeRelays = getStoredWriteRelays();
    const relays = getStoredRelays();
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

export function NWCContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPassphraseRequested, setIsPassphraseRequested] = useState(false);
  const [challengeResolver, setChallengeResolver] = useState<
    ((res: any) => void) | undefined
  >(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [abort, setAbort] = useState<() => void>(() => {});
  const [nwcString, setNWCString] = useState<string | null>(null);
  const [legacyNWCString, setLegacyNWCString] = useState<string | null>(null);
  const [nwcInfo, setNWCInfo] = useState<Record<string, any> | null>(null);
  const [hasStoredConnection, setHasStoredConnection] = useState(false);
  const [hasLegacyConnection, setHasLegacyConnection] = useState(false);
  const rememberedPassphraseRef = useRef<string | undefined>(undefined);
  const inputPassphraseRef = useRef<string | undefined>(undefined);
  const inputPassphraseClearerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const clearPassphraseState = useCallback(() => {
    rememberedPassphraseRef.current = undefined;
    inputPassphraseRef.current = undefined;
    if (inputPassphraseClearerRef.current) {
      clearTimeout(inputPassphraseClearerRef.current);
      inputPassphraseClearerRef.current = undefined;
    }
  }, []);

  const registerSuccessfulPassphrase = useCallback(
    (passphrase: string, remember: boolean) => {
      if (remember) {
        rememberedPassphraseRef.current = passphrase;
      }

      if (inputPassphraseClearerRef.current) {
        clearTimeout(inputPassphraseClearerRef.current);
      }

      inputPassphraseRef.current = passphrase;
      inputPassphraseClearerRef.current = setTimeout(() => {
        inputPassphraseRef.current = undefined;
        inputPassphraseClearerRef.current = undefined;
      }, 5000);
    },
    []
  );

  const loadNWCState = useCallback(() => {
    const {
      nwcString: storedString,
      legacyNWCString: storedLegacyString,
      nwcInfo: storedInfo,
      hasStoredNWCConnection,
      hasLegacyNWCConnection,
    } = getLocalStorageData();

    setNWCString(storedString || null);
    setLegacyNWCString(storedLegacyString || null);
    setHasStoredConnection(Boolean(hasStoredNWCConnection));
    setHasLegacyConnection(Boolean(hasLegacyNWCConnection));

    if (!hasStoredNWCConnection && !hasLegacyNWCConnection) {
      clearPassphraseState();
    }

    if (storedInfo) {
      try {
        setNWCInfo(JSON.parse(storedInfo));
      } catch (e) {
        console.error("Failed to parse saved NWC info", e);
        setNWCInfo(null);
      }
    } else {
      setNWCInfo(null);
    }
  }, []);

  useEffect(() => {
    const handleStorage = () => loadNWCState();
    window.addEventListener("storage", handleStorage);
    loadNWCState();

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadNWCState]);

  const requestPassphrase = useCallback(
    (
      currentError?: Error
    ): Promise<{ passphrase: string; remember: boolean }> => {
      return new Promise((resolve, reject) => {
        setError(currentError);
        setAbort(() => () => reject(new Error("Action cancelled by user")));
        setChallengeResolver(() => {
          return async ({ res, remind }: { res: string; remind: boolean }) => {
            resolve({ passphrase: res, remember: remind });
          };
        });
        setIsPassphraseRequested(true);
      });
    },
    []
  );

  const getPassphrase = useCallback(
    async (currentError?: Error): Promise<[string, boolean]> => {
      if (rememberedPassphraseRef.current) {
        return [rememberedPassphraseRef.current, false];
      }

      if (inputPassphraseRef.current) {
        return [inputPassphraseRef.current, false];
      }

      const { passphrase, remember } = await requestPassphrase(currentError);
      return [passphrase || "", remember];
    },
    [requestPassphrase]
  );

  const ensureUnlocked = useCallback(async (): Promise<string> => {
    if (nwcString) return nwcString;
    if (!hasStoredConnection) {
      throw new Error("NWC connection not found.");
    }

    let currentError: Error | undefined;

    while (true) {
      const [passphrase, remember] = await getPassphrase(currentError);
      try {
        const unlocked = await unlockNWCString(passphrase);
        registerSuccessfulPassphrase(passphrase, remember);
        setError(undefined);
        setIsPassphraseRequested(false);
        loadNWCState();
        return unlocked;
      } catch (e) {
        currentError = e as Error;
        setError(currentError);
      }
    }
  }, [
    getPassphrase,
    hasStoredConnection,
    loadNWCState,
    nwcString,
    registerSuccessfulPassphrase,
  ]);

  const saveConnection = useCallback(
    async (
      rawNWCString: string,
      info: Record<string, any>,
      passphrase: string
    ) => {
      await saveEncryptedNWCString(rawNWCString, passphrase);
      saveNWCInfo(info);
      loadNWCState();
    },
    [loadNWCState]
  );

  const lockConnection = useCallback(() => {
    clearPassphraseState();
    lockNWCConnection();
    loadNWCState();
  }, [clearPassphraseState, loadNWCState]);

  const removeConnection = useCallback(() => {
    clearPassphraseState();
    clearNWCConnection();
    setError(undefined);
    setIsPassphraseRequested(false);
    loadNWCState();
  }, [clearPassphraseState, loadNWCState]);

  useEffect(() => {
    return () => {
      clearPassphraseState();
    };
  }, [clearPassphraseState]);

  return (
    <>
      <NWCContext.Provider
        value={{
          nwcString,
          legacyNWCString,
          nwcInfo,
          hasStoredConnection,
          hasLegacyConnection,
          isUnlocked: Boolean(nwcString),
          saveConnection,
          ensureUnlocked,
          lockConnection,
          removeConnection,
        }}
      >
        <PassphraseChallengeModal
          actionOnSubmit={(passphrase: string, remind: boolean) => {
            if (challengeResolver) {
              challengeResolver({ res: passphrase, remind });
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
          onCancelRouteTo={router.asPath}
        />
        {children}
      </NWCContext.Provider>
    </>
  );
}
