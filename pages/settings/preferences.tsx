import { useEffect, useContext } from "react";
import { useRouter } from "next/router";
import { UIContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const PreferencesRedirect = () => {
  const router = useRouter();
  const { setPreferencesModalOpen } = useContext(UIContext);
  const { isLoggedIn, isAuthStateResolved } = useContext(SignerContext);

  useEffect(() => {
    if (!router.isReady || !isAuthStateResolved) return;

    if (isLoggedIn) {
      setPreferencesModalOpen(true);
    }

    router.replace("/settings");
  }, [
    isAuthStateResolved,
    isLoggedIn,
    router,
    setPreferencesModalOpen,
  ]);

  return null;
};

export default PreferencesRedirect;
