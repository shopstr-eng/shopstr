import { getLocalStorageData } from "../../components/utility/nostr-helper-functions";
import { NostrEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";

export const ChatMessage = ({
  messageEvent,
  index,
  currentChatPubkey,
}: {
  messageEvent?: NostrEvent;
  index?: number;
  currentChatPubkey?: string;
}) => {
  if (!messageEvent || !index || !currentChatPubkey) {
    return null;
  }
  const { decryptedNpub } = getLocalStorageData();
  return (
    <div
      key={index}
      className={`my-2 flex ${
        messageEvent.pubkey === decryptedNpub
          ? "justify-end"
          : messageEvent.pubkey === currentChatPubkey
            ? "justify-start"
            : ""
      }`}
    >
      <div
        className={`flex max-w-[90%] flex-col rounded-t-large p-3  ${
          messageEvent.pubkey === decryptedNpub
            ? "rounded-bl-lg bg-shopstr-purple-light text-light-bg dark:bg-shopstr-yellow-light dark:text-dark-bg"
            : "rounded-br-lg bg-gray-200 text-light-text dark:bg-gray-300 "
        }`}
      >
        <p className={`inline-block flex-wrap overflow-x-hidden break-all`}>
          {messageEvent.content}
        </p>
        <div className="m-1"></div>
        <span
          className={`text-xs opacity-50 ${
            messageEvent.pubkey === decryptedNpub ? "text-right" : "text-left"
          }`}
        >
          {timeSinceMessageDisplayText(messageEvent.created_at).dateTime}
        </span>
      </div>
    </div>
  );
};

export default ChatMessage;
