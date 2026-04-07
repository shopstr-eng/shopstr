import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import { useDisclosure } from "@nextui-org/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

export function useAuthGuard() {
  const { isLoggedIn, isAuthStateResolved } = useContext(SignerContext);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const hasResolvedAuthState = isAuthStateResolved ?? true;
  const isGuarded = hasResolvedAuthState && isLoggedIn === false;

  useEffect(() => {
    if (isGuarded) {
      onOpen();
    }
  }, [isGuarded, onOpen]);

  const handleClose = () => {
    onClose();
    router.replace("/marketplace");
  };

  return {
    isLoggedIn,
    isAuthResolved: hasResolvedAuthState,
    isGuarded,
    isOpen,
    handleClose,
  };
}

