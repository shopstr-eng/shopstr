import { getLocalStorageData } from "../components/utility/nostr-helper-functions";
import { NostrEvent } from "../types";
import { timeSinceMessageDisplayText } from "./utils";

export const ChatMessage = ({
  messageEvent,
  index,
  currentChatPubkey,
}: {
  messageEvent: NostrEvent;
  index: number;
  currentChatPubkey: string;
}) => {
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
        className={`flex max-w-[90%] flex-col rounded-t-large p-3 ${
          messageEvent.pubkey === decryptedNpub
            ? "rounded-bl-lg bg-purple-200"
            : "rounded-br-lg bg-gray-300"
        }`}
      >
        <p className={`inline-block flex-wrap break-words`}>
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
