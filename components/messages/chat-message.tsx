import { useState } from "react";
import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import ClaimButton from "../utility-components/claim-button";
import { NostrMessageEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";

function isDecodableToken(token: string): boolean {
  try {
    atob(token);
    return true;
  } catch (e) {
    return false;
  }
}

export const ChatMessage = ({
  messageEvent,
  index = 0,
  currentChatPubkey,
  passphrase,
}: {
  messageEvent?: NostrMessageEvent;
  index: number;
  currentChatPubkey?: string;
  passphrase?: string;
}) => {
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  if (!messageEvent || !currentChatPubkey) {
    return null;
  }
  const tokenAfterCashuA = messageEvent.content.includes("cashuA")
    ? messageEvent.content.split("cashuA")[1]
    : null;
  const canDecodeToken = tokenAfterCashuA
    ? isDecodableToken(tokenAfterCashuA)
    : false;
  const contentBeforeCashuA = messageEvent.content.includes("cashuA")
    ? messageEvent.content.split("cashuA")[0]
    : messageEvent.content;

  const { userPubkey } = getLocalStorageData();

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2000);
  };

  return (
    <div
      key={index}
      className={`my-2 flex ${
        messageEvent.pubkey === userPubkey
          ? "justify-end"
          : messageEvent.pubkey === currentChatPubkey
            ? "justify-start"
            : ""
      }`}
    >
      <div
        className={`flex max-w-[90%] flex-col rounded-t-large p-3  ${
          messageEvent.pubkey === userPubkey
            ? "rounded-bl-lg bg-shopstr-purple-light text-light-bg dark:bg-shopstr-yellow-light dark:text-dark-bg"
            : "rounded-br-lg bg-gray-200 text-light-text dark:bg-gray-300 "
        }`}
      >
        <p className={`inline-block flex-wrap overflow-x-hidden break-all`}>
          {messageEvent.content.includes("cashuA") &&
          canDecodeToken &&
          tokenAfterCashuA ? (
            <>
              {contentBeforeCashuA}
              <div className="flex items-center">
                <ClaimButton token={tokenAfterCashuA} passphrase={passphrase} />
                <ClipboardIcon
                  onClick={() => handleCopyToken("cashuA" + tokenAfterCashuA)}
                  className={`ml-2 mt-1 h-5 w-5 cursor-pointer text-dark-text dark:text-light-text ${
                    copiedToClipboard ? "hidden" : ""
                  }`}
                />
                <CheckIcon
                  className={`ml-2 mt-1 h-5 w-5 cursor-pointer text-dark-text dark:text-light-text ${
                    copiedToClipboard ? "" : "hidden"
                  }`}
                />
              </div>
            </>
          ) : (
            <>{messageEvent.content}</>
          )}
        </p>
        <div className="m-1"></div>
        <span
          className={`text-xs opacity-50 ${
            messageEvent.pubkey === userPubkey ? "text-right" : "text-left"
          }`}
        >
          {timeSinceMessageDisplayText(messageEvent.created_at).dateTime}
        </span>
      </div>
    </div>
  );
};

export default ChatMessage;
