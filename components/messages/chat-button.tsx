import { useEffect, useRef } from "react";
import { ChatObject } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";
import { ProfileAvatar } from "@/components/utility-components/profile/profile-avatar";

const ChatButton = ({
  pubkeyOfChat,
  chatObject,
  openedChatPubkey,
  handleClickChat,
}: {
  pubkeyOfChat: string;
  chatObject: ChatObject;
  openedChatPubkey: string;
  handleClickChat: (pubkey: string) => void;
}) => {
  const messages = chatObject?.decryptedChat;
  const lastMessage =
    messages && messages.length > 0 && messages[messages.length - 1];
  const unreadCount = chatObject?.unreadCount;

  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pubkeyOfChat === openedChatPubkey) {
      divRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [openedChatPubkey]);

  const isActive = pubkeyOfChat === openedChatPubkey;

  return (
    <div
      key={pubkeyOfChat}
      ref={divRef}
      onClick={() => handleClickChat(pubkeyOfChat)}
      className={`mx-3 mb-3 flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md dark:border-gray-700 dark:hover:bg-gray-800 ${
        isActive 
          ? "bg-gray-100 ring-2 ring-shopstr-purple-light dark:bg-gray-800 dark:ring-shopstr-yellow-light" 
          : "bg-white dark:bg-gray-900"
      }`}
    >
      <ProfileAvatar
        pubkey={pubkeyOfChat}
        description={lastMessage ? lastMessage.content : "No messages yet"}
        descriptionClassname="line-clamp-1 break-all overflow-hidden text-gray-600 dark:text-gray-300 w-full text-sm"
        baseClassname="justify-start w-4/5"
        wrapperClassname="w-4/5 h-full"
      />
      
      <div className="flex flex-shrink-0 flex-grow flex-col text-right">
        <div className="h-6 flex justify-end">
          {unreadCount > 0 && (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-shopstr-purple-light font-medium text-xs text-white dark:bg-shopstr-yellow-light dark:text-gray-900">
              {unreadCount}
            </span>
          )}
        </div>
        
        <div className="mt-1 h-5">
          {lastMessage && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {timeSinceMessageDisplayText(lastMessage.created_at).short}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatButton;
