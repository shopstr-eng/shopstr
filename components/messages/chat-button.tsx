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
  }, [openedChatPubkey, pubkeyOfChat]);

  return (
    <div
      key={pubkeyOfChat}
      className={`mx-3 mt-3 mb-2 flex cursor-pointer items-center gap-4 rounded-xl border px-3 py-3 transition-all hover:border-zinc-500 ${
        pubkeyOfChat === openedChatPubkey
          ? "border-yellow-400 bg-[#27272a]"
          : "border-zinc-800 bg-[#111]"
      }`}
      onClick={() => handleClickChat(pubkeyOfChat)}
      ref={divRef}
    >
      <ProfileAvatar
        pubkey={pubkeyOfChat}
        description={lastMessage ? lastMessage.content : "No messages yet"}
        descriptionClassname="line-clamp-1 break-all overflow-hidden text-zinc-400 w-full h-[15px]"
        baseClassname="justify-start w-full"
        wrapperClassname="h-full min-w-0 flex-1"
      />
      <div className="flex flex-shrink-0 flex-col text-right text-white">
        <div className="h-1/2">
          {unreadCount > 0 ? (
            <span className="ml-2 rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-bold text-black">
              {unreadCount}
            </span>
          ) : (
            <div className="h-[20px]">{/* spacer */}</div>
          )}
        </div>
        <div className="h-1/2">
          <span className="text-xs font-bold text-zinc-500">
            {lastMessage
              ? timeSinceMessageDisplayText(lastMessage.created_at).short
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatButton;
