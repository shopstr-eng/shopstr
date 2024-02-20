import { ProfileAvatar } from "../components/utility-components/profile/avatar";
import { ProfileDisplayName } from "../components/utility-components/profile/display-name";
import { ChatObject } from "../types";
import { timeSinceMessageDisplayText } from "./utils";

export const ChatButton = ({
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
  let messages = chatObject.decryptedChat;
  let lastMessage = messages[messages.length - 1];
  let unreadCount = chatObject.unreadCount;

  return (
    <div
      key={pubkeyOfChat}
      className={`mx-3 mb-2 flex cursor-pointer items-center gap-4 rounded-md border-2 border-light-fg px-3 py-2 hover:opacity-70 dark:border-dark-fg ${
        pubkeyOfChat === openedChatPubkey ? "bg-[#ccccccb9]" : ""
      }`}
      onClick={() => handleClickChat(pubkeyOfChat)}
    >
      <div className="flex-shrink-0 overflow-clip">
        <ProfileAvatar pubkey={pubkeyOfChat} />
      </div>
      <div className="flex w-1/2 flex-col">
        <ProfileDisplayName pubkey={pubkeyOfChat} />
        <span className="truncate text-light-text dark:text-dark-text">
          {lastMessage ? lastMessage.content : "No messages yet"}
        </span>
      </div>
      <div className="flex flex-shrink-0 flex-grow flex-row-reverse flex-col text-right text-light-text dark:text-dark-text">
        <div className="h-1/2">
          {unreadCount > 0 ? (
            <span className="ml-2 h-52 w-52 rounded-full bg-shopstr-purple-light p-1 text-xs text-light-bg dark:bg-shopstr-yellow-light dark:text-dark-bg">
              {unreadCount}
            </span>
          ) : (
            <div className="h-[20px]">{/* spacer */}</div>
          )}
        </div>
        <div className="h-1/2">
          <span>
            {lastMessage
              ? timeSinceMessageDisplayText(lastMessage.created_at).short
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
};
