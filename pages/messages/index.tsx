import React from "react";
import MessageFeed from "@/components/messages/message-feed";

export default function MessageView() {
  return (
    <div className="flex min-h-screen flex-col bg-light-bg pt-16 dark:bg-dark-bg">
      <MessageFeed />
    </div>
  );
}
