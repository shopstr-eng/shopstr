import React from "react";
import { useRouter } from "next/router";
import MessageFeed from "@/components/messages/message-feed";

export default function MessageView() {
  const router = useRouter();
  const { isInquiry } = router.query;

  return (
    <div className="flex min-h-screen flex-col bg-[#111] pt-16 text-white selection:bg-yellow-400 selection:text-black">
      <MessageFeed
        {...(isInquiry !== undefined
          ? { isInquiry: isInquiry === "true" }
          : {})}
      />
    </div>
  );
}
