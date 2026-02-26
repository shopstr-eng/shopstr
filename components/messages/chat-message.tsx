import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import ClaimButton from "../utility-components/claim-button";
import FailureModal from "../utility-components/failure-modal";
import { NostrMessageEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";
import { getDecodedToken } from "@cashu/cashu-ts";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  decodeDigitalContentPayload,
  decodeDigitalContentDeliveryPayload,
  decryptFileWithNip44,
} from "@/utils/encryption/file-encryption";

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
  const [isDownloadingDigitalContent, setIsDownloadingDigitalContent] =
    useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const { pubkey: userPubkey } = useContext(SignerContext);

  useEffect(() => {
    if (messageEvent?.content && messageEvent.content.includes("npub")) {
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
        .map((tag) => [tag[0], tag[1]])
        .filter(
          (pair): pair is [string, string] =>
            pair[0] !== undefined && pair[1] !== undefined
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
  const isDigitalContentDelivery = messageEvent.content.startsWith(
    "digital_content_delivery:"
  );
  const digitalContentDeliveryPayload = isDigitalContentDelivery
    ? messageEvent.content.replace("digital_content_delivery:", "")
    : null;

  let orderData = null;
  try {
    if (messageEvent.content.trim().startsWith("{")) {
      const parsed = JSON.parse(messageEvent.content);
      if (parsed.type === "zapsnag_order" && parsed.shipping) {
        orderData = parsed;
      }
    }
  } catch (e) {}

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
  };

  const handleDownloadDigitalContent = async (encodedDelivery: string) => {
    try {
      setIsDownloadingDigitalContent(true);
      const deliveryPayload = decodeDigitalContentDeliveryPayload(encodedDelivery);
      let fileInfo: {
        url: string;
        nsec: string;
        mimeType?: string;
        fileName?: string;
        listingId?: string;
      };

      if ("v" in deliveryPayload && deliveryPayload.v === 2) {
        fileInfo = {
          url: deliveryPayload.url,
          nsec: deliveryPayload.nsec,
          mimeType: deliveryPayload.mimeType,
          fileName: deliveryPayload.fileName,
          listingId: deliveryPayload.listingId,
        };
      } else if ("payload" in deliveryPayload && deliveryPayload.payload) {
        const contentPayload = decodeDigitalContentPayload(deliveryPayload.payload);
        if (!("nsec" in contentPayload)) {
          throw new Error("Legacy digital payload is missing decryption key");
        }
        fileInfo = {
          url: contentPayload.url,
          nsec: contentPayload.nsec,
          mimeType: contentPayload.mimeType,
          fileName: contentPayload.fileName,
          listingId: deliveryPayload.listingId,
        };
      } else {
        throw new Error("Digital delivery payload is malformed");
      }

      const response = await fetch(fileInfo.url);
      if (!response.ok) {
        throw new Error("Failed to fetch encrypted digital content");
      }

      const encryptedBlob = await response.blob();
      const arrayBuffer = await encryptedBlob.arrayBuffer();
      const decryptedBlob = await decryptFileWithNip44(
        arrayBuffer,
        fileInfo.nsec
      );

      const finalBlob = new Blob([decryptedBlob], {
        type: fileInfo.mimeType || "application/octet-stream",
      });
      const objectUrl = URL.createObjectURL(finalBlob);

      const downloadLink = document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.download =
        fileInfo.fileName ||
        fileInfo.listingId ||
        "digital-content.bin";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Digital content download failed:", error);
      const errorText =
        error instanceof Error ? error.message : "Unknown download error";
      setFailureText(`Failed to download digital content: ${errorText}`);
      setShowFailureModal(true);
    } finally {
      setIsDownloadingDigitalContent(false);
    }
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
    <>
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
          className={`flex max-w-[90%] flex-col rounded-t-large p-3 ${
            isUserMessage
              ? "dark:from-shopstr-yellow-dark rounded-bl-lg bg-gradient-to-br from-shopstr-purple to-shopstr-purple-light text-white dark:to-shopstr-yellow-light dark:text-dark-bg"
              : "rounded-br-lg bg-gray-300 text-light-text dark:bg-gray-700 dark:text-dark-text"
          }`}
        >
          <p className="inline-block flex-wrap overflow-x-hidden break-all">
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
              <div className="flex flex-col gap-2 border-l-4 border-shopstr-purple pl-3 dark:border-shopstr-yellow">
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
            ) : isDigitalContentDelivery && digitalContentDeliveryPayload ? (
              <button
                className="rounded-md bg-shopstr-purple px-3 py-2 text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-shopstr-yellow dark:text-black"
                disabled={isDownloadingDigitalContent}
                onClick={() =>
                  handleDownloadDigitalContent(digitalContentDeliveryPayload)
                }
              >
                {isDownloadingDigitalContent
                  ? "Preparing download..."
                  : "Download Digital Content"}
              </button>
            ) : (
              renderMessageContent(messageEvent.content)
            )}
          </p>
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
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
      />
    </>
  );
};

export default ChatMessage;
