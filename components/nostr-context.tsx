import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getLocalStorageData } from "./utility/nostr-helper-functions";
import PassphraseChallengeModal from "@/components/utility-components/request-passphrase-modal";
import AuthUrlChallengeModal from "@/components/utility-components/auth-challenge-modal";
import { NostrNIP07Signer } from "@/utils/nostr/signers/nostr-nip07-signer";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";

type _SignerContext = {
  signer?: NostrSigner;
  isLoggedIn?: boolean;
  pubkey?: string;
  npub?: string;
  newSigner?: (type: string, args: any) => NostrSigner;
};

type _NostrContext = {
  nostr?: NostrManager;
};

const SignerContext = createContext<_SignerContext>({});

export function useSignerContext() {
  return useContext(SignerContext);
}

export function SignerContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  const challengeHandler: ChallengeHandler = (
    type,
    challenge,
    abort,
    abortSignal,
    error,
  ) => {
    return new Promise((resolve, reject) => {
      console.log("Challenge requested");
      setError(error);
      setAbort(() => abort);
      setChallengeResolver(() => {
        return async (res: any) => {
          console.log("Resolving challenge", res);
          resolve(res);
        };
      });
      switch (type) {
        case "passphrase": {
          console.log("Request passphrase");
          setIsPassphraseRequested(true);
          // automatically close the modal when the challenge is aborted
          abortSignal.addEventListener("abort", () => {
            setIsPassphraseRequested(false);
          });
          break;
        }
        case "auth_url": {
          console.log("Request auth challenge");
          setAuthUrl(challenge);
          setIsAuthChallengeRequested(true);
          // automatically close the modal when the challenge is aborted or resolved
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

  const loadSigner = useCallback(() => {
    console.log("Reloading signer");
    const { signer } = getLocalStorageData();
    if (!signer) {
      setSigner(undefined);
      return;
    }

    const signerObject: NostrSigner = NostrManager.signerFrom(
      signer!,
      challengeHandler,
    );
    setSigner(signerObject);
    if (!signerObject) return;
    signerObject.getPubKey().then(
      (key) => {
        setPubKey(key);
      },
      (err) => {
        setPubKey(undefined);
      },
    );

    signerObject.getNPub().then(
      (key) => {
        setNPub(key);
      },
      (err) => {
        setNPub(undefined);
      },
    );
  }, []);

  useEffect(() => {
    loadSigner();

    window.addEventListener("storage", loadSigner);

    return () => {
      window.removeEventListener("storage", loadSigner);
    };
  }, [loadSigner]);

  useEffect(() => {
    setIsLoggedIn(!!(signer && pubkey));
  }, [signer, pubkey]);

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
          pubkey,
          npub,
          newSigner,
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
        {children}
      </SignerContext.Provider>
    </>
  );
}

const NostrContext = createContext<_NostrContext>({});

export function useNostrContext() {
  return useContext(NostrContext);
}

export function NostrContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [nostr] = useState<NostrManager>(new NostrManager());

  const reload = useCallback(() => {
    console.log("Reloading nostr");
    const { readRelays, writeRelays, relays } = getLocalStorageData();
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
