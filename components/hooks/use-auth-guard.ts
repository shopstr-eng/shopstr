import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import { useDisclosure } from "@nextui-org/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

export function useAuthGuard() {
  const { isLoggedIn } = useContext(SignerContext);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    if (isLoggedIn === false) {
      onOpen();
    }
  }, [isLoggedIn, onOpen]);

  const handleClose = () => {
    onClose();
    router.push("/marketplace");
  };

  return { isLoggedIn, isOpen, handleClose };
}
