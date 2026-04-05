import { useRouter } from "next/router";
import MessageFeed from "@/components/messages/message-feed";
import SignInModal from "@/components/sign-in/SignInModal";
import { useAuthGuard } from "@/components/hooks/use-auth-guard";

export default function MessageView() {
  const { isLoggedIn, isOpen, handleClose } = useAuthGuard();
  const router = useRouter();
  const { isInquiry } = router.query;

  if (!isLoggedIn) {
    return <SignInModal isOpen={isOpen} onClose={handleClose} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pt-16 dark:bg-dark-bg">
      <MessageFeed
        {...(isInquiry !== undefined
          ? { isInquiry: isInquiry === "true" }
          : {})}
      />
    </div>
  );
}
