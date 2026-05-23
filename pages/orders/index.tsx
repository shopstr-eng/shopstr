import { useRouter } from "next/router";
import MessageFeed from "@/components/messages/message-feed";
import ProtectedRoute from "@/components/utility-components/protected-route";

export default function MessageView() {
  const router = useRouter();
  const { isInquiry } = router.query;

  return (
    <ProtectedRoute>
      <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-16">
        <MessageFeed
          {...(isInquiry !== undefined
            ? { isInquiry: isInquiry === "true" }
            : {})}
        />
      </div>
    </ProtectedRoute>
  );
}
