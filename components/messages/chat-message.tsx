import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import ClaimButton from "../utility-components/claim-button";
import LinkPreview from "./link-preview";
import { NostrMessageEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";
import { getDecodedToken } from "@cashu/cashu-ts";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

function isDecodableToken(token: string): boolean {
  try {
    getDecodedToken(token, []);
    return true;
  } catch {
    return false;
  }
}

function decodeBuyerPubkeyFromContent(content: string): string | null {
  const npubMatch = content.match(/npub[a-zA-Z0-9]+/);
  if (!npubMatch) {
    return null;
  }

  try {
    const decoded = nip19.decode(npubMatch[0]);
    return decoded.type === "npub" && typeof decoded.data === "string"
      ? decoded.data
      : null;
  } catch {
    return null;
  }
}

function isDecodableNpub(value: string): boolean {
  try {
    const decoded = nip19.decode(value);
    return decoded.type === "npub" && typeof decoded.data === "string";
  } catch {
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
    if (messageEvent?.content && messageEvent.content.includes("npub1")) {
      const buyerPubkey = decodeBuyerPubkeyFromContent(messageEvent.content);
      setBuyerPubkey(buyerPubkey || "");
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
        subject === "shipping-info" ||
        subject === "zapsnag-order"
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

  let orderData = null;
  try {
    if (messageEvent.content.trim().startsWith("{")) {
      const parsed = JSON.parse(messageEvent.content);
      if (parsed.type === "zapsnag_order" && parsed.shipping) {
        orderData = parsed;
      }
    }
  } catch {}

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
  };

  const renderMessageContent = (content: string) => {
    const parts = content.split(/(https?:\/\/[^\s<>"']+)/g);
    return parts.map((part, index) => {
      if (/^https?:\/\//.test(part)) {
        return (
          <span key={index} className="block">
            <LinkPreview url={part} isUserMessage={isUserMessage} />
          </span>
        );
      }
      const subParts = part.split(/(\s+)/);
      return subParts.map((sub, subIndex) => {
        const npubMatch = sub.match(/npub[a-zA-Z0-9]+/);
        if (npubMatch && isDecodableNpub(npubMatch[0])) {
          return (
            <span
              key={`${index}-${subIndex}`}
              className="text-shopstr-purple dark:text-shopstr-yellow cursor-pointer hover:underline"
              onClick={() => {
                router.replace({
                  pathname: "/orders",
                  query: { pk: npubMatch[0], isInquiry: true },
                });
              }}
            >
              {sub}
            </span>
          );
        }
        return sub;
      });
    });
  };

  const isUserMessage = messageEvent.pubkey === userPubkey;

  return (
    <div
      key={index}
      className={`my-2 flex ${
        isUserMessage
          ? "justify-end"
          : messageEvent.pubkey === currentChatPubkey
            ? "justify-start"
            : ""
      }`}
    >
      <div
        className={`rounded-t-large flex max-w-[90%] flex-col p-3 ${
          isUserMessage
            ? "dark:from-shopstr-yellow-dark from-shopstr-purple to-shopstr-purple-light dark:to-shopstr-yellow-light dark:text-dark-bg rounded-bl-lg bg-gradient-to-br text-white"
            : "text-light-text dark:text-dark-text rounded-br-lg bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <div className="flex flex-col overflow-x-hidden break-all">
          {cashuPrefix && canDecodeToken && tokenAfterCashuVersion ? (
            <>
              {renderMessageContent(contentBeforeCashu!)}
              <div className="flex items-center">
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
          ) : orderData ? (
            <div className="border-shopstr-purple dark:border-shopstr-yellow flex flex-col gap-2 border-l-4 pl-3">
              <span className="text-sm font-bold uppercase opacity-70">
                ⚡ Zapsnag Order
              </span>
              <div className="font-semibold">{orderData.shipping.name}</div>
              <div className="text-sm">{orderData.shipping.address}</div>
              <div className="text-sm">
                {orderData.shipping.city}, {orderData.shipping.state}{" "}
                {orderData.shipping.zip}
              </div>
              <div className="text-sm">{orderData.shipping.country}</div>
              <div className="mt-1 text-xs opacity-50">
                Order ID: {orderData.orderId.slice(0, 8)}...
              </div>
            </div>
          ) : (
            renderMessageContent(messageEvent.content)
          )}
        </div>
        <div className="m-1"></div>
        <span
          className={`text-xs opacity-50 ${
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
