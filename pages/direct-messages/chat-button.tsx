import { ProfileAvatar } from "../components/utility-components/profile/avatar";
import { ProfileDisplayName } from "../components/utility-components/profile/display-name";
import { timeSinceMessageDisplayText } from "./utils";

export const ChatButton = ({
  pubkeyOfChat,
  messages,
  openedChatPubkey,
  handleClickChat,
}: {
  pubkeyOfChat: string;
  messages: any[];
  openedChatPubkey: string;
  handleClickChat: (pubkey: string) => void;
}) => {
  let lastMessage = messages[messages.length - 1];

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
          {lastMessage.content}
        </span>
      </div>
      <div className="flex flex-shrink-0 flex-grow flex-row-reverse text-right text-light-text dark:text-dark-text">
        {timeSinceMessageDisplayText(lastMessage.created_at).short}
      </div>
    </div>
  );
};
