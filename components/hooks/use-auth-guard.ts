import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import { useDisclosure } from "@nextui-org/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

export function useAuthGuard() {
  const { isLoggedIn } = useContext(SignerContext);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const isGuarded = isLoggedIn === false;

  useEffect(() => {
    if (isGuarded) {
      onOpen();
    }
  }, [isGuarded, onOpen]);

  const handleClose = () => {
    onClose();
    router.replace("/marketplace");
  };

  return { isLoggedIn, isGuarded, isOpen, handleClose };
}

