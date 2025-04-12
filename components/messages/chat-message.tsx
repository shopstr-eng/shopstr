import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import ClaimButton from "../utility-components/claim-button";
import { NostrMessageEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";
import { getDecodedToken } from "@cashu/cashu-ts";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

function isDecodableToken(token: string): boolean {
  try {
    getDecodedToken(token);
    return true;
  } catch (e) {
    return false;
  }
}

const ChatMessage = ({
  messageEvent,
  index = 0,
  currentChatPubkey,
  setBuyerPubkey,
  setCanReview,
  setProductAddress,
  setOrderId,
}: {
  messageEvent: NostrMessageEvent;
  index: number;
  currentChatPubkey: string;
  setBuyerPubkey: (pubkey: string) => void;
  setCanReview: (canReview: boolean) => void;
  setProductAddress: (productAddress: string) => void;
  setOrderId: (orderId: string) => void;
}) => {
  const router = useRouter();
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const { pubkey: userPubkey } = useContext(SignerContext);

  useEffect(() => {
    if (messageEvent?.content && messageEvent.content.includes("npub")) {
      // Find word containing npub using regex
      const npubMatch = messageEvent.content.match(/npub[a-zA-Z0-9]+/);
      if (npubMatch && setBuyerPubkey) {
        const { data: buyerPubkey } = nip19.decode(npubMatch[0]);
        setBuyerPubkey(buyerPubkey as string);
      }
    } else {
      setBuyerPubkey("");
    }
  }, [messageEvent?.content, setBuyerPubkey]);

  useEffect(() => {
    const tagsMap = new Map(
      messageEvent.tags
        .map((tag) => [tag[0], tag[1]]) // Take first two elements regardless of length
        .filter(
          (pair): pair is [string, string] =>
            pair[0] !== undefined && pair[1] !== undefined // Ensure both elements exist
        )
    );
    const subject = tagsMap.get("subject") ? tagsMap.get("subject") : null;
    const productAddress = tagsMap.get("a")
      ? tagsMap.get("a")
      : tagsMap.get("item")
        ? tagsMap.get("item")
        : "";
    const orderId = tagsMap.get("order") ? tagsMap.get("order") : "";
    setCanReview?.(
      subject === "order-info" ||
        subject === "order-receipt" ||
        subject === "shipping-info"
    );
    setProductAddress?.(productAddress as string);
    setOrderId?.(orderId as string);
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

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
  };

  const renderMessageContent = (content: string) => {
    const words = content.split(/(\s+)/);
    return words.map((word, index) => {
      const npubMatch = word.match(/npub[a-zA-Z0-9]+/);
      if (npubMatch) {
        return (
          <span
            key={index}
            className="cursor-pointer text-shopstr-purple hover:underline dark:text-shopstr-yellow"
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

  const isUserMessage = messageEvent.pubkey === userPubkey;

  return (
    <div
      key={index}
      className={`my-3 flex ${
        isUserMessage
          ? "justify-end"
          : messageEvent.pubkey === currentChatPubkey
            ? "justify-start"
            : ""
      }`}
    >
      <div
        className={`flex max-w-[85%] flex-col ${
          isUserMessage
            ? "rounded-tl-xl rounded-tr-xl rounded-bl-xl bg-gradient-to-br from-shopstr-purple to-shopstr-purple-light text-white shadow-md dark:from-shopstr-yellow-dark dark:to-shopstr-yellow-light dark:text-dark-bg"
            : "rounded-tl-xl rounded-tr-xl rounded-br-xl bg-gray-100 text-light-text shadow-md dark:bg-gray-700 dark:text-dark-text"
        } p-4`}
      >
        <p className="inline-block flex-wrap overflow-x-hidden break-all text-sm">
          {cashuPrefix && canDecodeToken && tokenAfterCashuVersion ? (
            <>
              {renderMessageContent(contentBeforeCashu!)}
              <div className="mt-2 flex items-center rounded-lg bg-white/20 p-2 dark:bg-black/20">
                <ClaimButton token={cashuPrefix + tokenAfterCashuVersion} />
                {copiedToClipboard ? (
                  <CheckIcon className="ml-2 h-5 w-5 text-green-400" />
                ) : (
                  <ClipboardIcon
                    onClick={() =>
                      handleCopyToken(cashuPrefix + tokenAfterCashuVersion)
                    }
                    className="ml-2 h-5 w-5 cursor-pointer transition-all hover:scale-110"
                  />
                )}
              </div>
            </>
          ) : (
            renderMessageContent(messageEvent.content)
          )}
        </p>
        <div className="h-1"></div>
        <span
          className={`mt-1 text-xs opacity-60 ${
            isUserMessage ? "text-right" : "text-left"
          }`}
        >
          {timeSinceMessageDisplayText(messageEvent.created_at).dateTime}
        </span>
      </div>
    </div>
  );
};

export default ChatMessage;
