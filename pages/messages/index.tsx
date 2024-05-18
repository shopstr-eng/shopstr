import React from "react";
import MessageFeed from "@/components/messages/message-feed";

export default function MessageView() {
  return (
    <div className="flex min-h-screen flex-col bg-light-bg dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      <MessageFeed />
    </div>
  );
}
