import React from "react";
import { useRouter } from "next/router";
import MessageFeed from "@/components/messages/message-feed";

export default function MessageView() {
  const router = useRouter();
  const { isInquiry } = router.query;

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
