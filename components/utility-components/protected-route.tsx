import { ReactNode } from "react";
import SignInModal from "@/components/sign-in/SignInModal";
import { useAuthGuard } from "@/components/hooks/use-auth-guard";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isGuarded, isOpen, handleClose } = useAuthGuard();

  if (isGuarded) {
    return <SignInModal isOpen={isOpen} onClose={handleClose} />;
  }

  return <>{children}</>;
}
