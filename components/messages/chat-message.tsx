import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import ClaimButton from "../utility-components/claim-button";
import { NostrMessageEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";
import { getDecodedToken } from "@cashu/cashu-ts";

function isDecodableToken(token: string): boolean {
  try {
    getDecodedToken(token);
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
  setBuyerPubkey,
  setCanReview,
  setProductAddress,
  setOrderId,
}: {
  messageEvent: NostrMessageEvent;
  index: number;
  currentChatPubkey: string;
  passphrase?: string;
  setBuyerPubkey: (pubkey: string) => void;
  setCanReview: (canReview: boolean) => void;
  setProductAddress: (productAddress: string) => void;
  setOrderId: (orderId: string) => void;
}) => {
  const router = useRouter();

  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  useEffect(() => {
    if (messageEvent?.content && messageEvent.content.includes("npub")) {
      // Find word containing npub using regex
      const npubMatch = messageEvent.content.match(/npub[a-zA-Z0-9]+/);
      if (npubMatch && setBuyerPubkey) {
        let { data: buyerPubkey } = nip19.decode(npubMatch[0]);
        setBuyerPubkey(buyerPubkey as string);
      }
    }
  }, [messageEvent?.content, setBuyerPubkey]);

  useEffect(() => {
    let tagsMap = new Map(
      messageEvent.tags
        .map((tag) => [tag[0], tag[1]]) // Take first two elements regardless of length
        .filter(
          (pair): pair is [string, string] =>
            pair[0] !== undefined && pair[1] !== undefined, // Ensure both elements exist
        ),
    );
    let subject = tagsMap.get("subject") ? tagsMap.get("subject") : null;
    let productAddress = tagsMap.get("a") ? tagsMap.get("a") : null;
    let orderId = tagsMap.get("order") ? tagsMap.get("order") : null;
    setCanReview?.(
      subject === "order-info" ||
        subject === "order-receipt" ||
        subject === "shipping-info",
    );
    if (productAddress) {
      setProductAddress?.(productAddress);
    }
    if (orderId) {
      setOrderId?.(orderId);
    }
  }, [messageEvent]);

  const cashuMatch = messageEvent.content.match(/cashu[A-Za-z]/);
  const cashuPrefix = cashuMatch ? cashuMatch[0] : null;
  const tokenAfterCashuVersion = cashuPrefix
    ? messageEvent.content.split(cashuPrefix)[1]
    : null;
  const canDecodeToken = tokenAfterCashuVersion
    ? isDecodableToken(cashuPrefix + tokenAfterCashuVersion)
    : false;
  const contentBeforeCashu = cashuPrefix
    ? messageEvent.content.split(cashuPrefix)[0]
    : messageEvent.content;

  const { userPubkey } = getLocalStorageData();

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2000);
  };

  const renderMessageContent = (content: string) => {
    const words = content.split(/(\s+)/);
    return words.map((word, index) => {
      const npubMatch = word.match(/npub[a-zA-Z0-9]+/);
      if (npubMatch) {
        return (
          <span
            key={index}
            className="cursor-pointer text-shopstr-purple-light hover:underline dark:text-shopstr-yellow-light"
            onClick={() => {
              router.replace({
                pathname: "/orders",
                query: { pk: npubMatch[0], isInquiry: true },
              });
            }}
          >
            {word}
          </span>
        );
      }
      return word;
    });
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
          {cashuPrefix && canDecodeToken && tokenAfterCashuVersion ? (
            <>
              {renderMessageContent(contentBeforeCashu)}
              <div className="flex items-center">
                <ClaimButton
                  token={cashuPrefix + tokenAfterCashuVersion}
                  passphrase={passphrase}
                />
                <ClipboardIcon
                  onClick={() =>
                    handleCopyToken(cashuPrefix + tokenAfterCashuVersion)
                  }
                  className={`ml-2 mt-1 h-5 w-5 cursor-pointer text-light-text ${
                    copiedToClipboard ? "hidden" : ""
                  }`}
                />
                <CheckIcon
                  className={`ml-2 mt-1 h-5 w-5 cursor-pointer text-light-text ${
                    copiedToClipboard ? "" : "hidden"
                  }`}
                />
              </div>
            </>
          ) : (
            renderMessageContent(messageEvent.content)
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
