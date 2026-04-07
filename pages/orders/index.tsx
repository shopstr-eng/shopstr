import { useRouter } from "next/router";
import MessageFeed from "@/components/messages/message-feed";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";
import ProtectedRoute from "@/components/utility-components/protected-route";

export default function MessageView() {
  const router = useRouter();
  const { isInquiry, tab } = router.query;

  return (
    <ProtectedRoute>
      <div className="bg-white flex min-h-screen flex-col pt-16">
        <div className="px-4 pt-4">
          <StripeConnectBanner
            returnPath="/orders?stripe=success"
            refreshPath="/orders?stripe=refresh"
          />
        </div>
        <MessageFeed
          {...(isInquiry !== undefined
            ? { isInquiry: isInquiry === "true" }
            : {})}
          {...(typeof tab === "string" ? { initialTab: tab } : {})}
        />
      </div>
    </ProtectedRoute>
  );
}
