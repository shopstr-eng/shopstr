import { ReactNode } from "react";
import SignInModal from "@/components/sign-in/SignInModal";
import { useAuthGuard } from "@/components/hooks/use-auth-guard";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthResolved, isGuarded, isOpen, handleClose } = useAuthGuard();

  if (!isAuthResolved) {
    return <div className="bg-light-bg dark:bg-dark-bg min-h-screen" />;
  }

  if (isGuarded) {
    return <SignInModal isOpen={isOpen} onClose={handleClose} />;
  }

  return <>{children}</>;
}
