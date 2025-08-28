import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import {
  CheckIcon,
  ClipboardIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@nextui-org/react";
import ClaimButton from "../utility-components/claim-button";
import PDFAnnotator from "../utility-components/pdf-annotator";
import { NostrMessageEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";
import { getDecodedToken } from "@cashu/cashu-ts";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  blossomUpload,
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  generateKeys,
  getLocalStorageData,
} from "../../utils/nostr/nostr-helper-functions";

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
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [currentPdfUrl, setCurrentPdfUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const {
    pubkey: userPubkey,
    npub: userNpub,
    signer,
    isLoggedIn,
  } = useContext(SignerContext);

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

  const detectHerdsharePdfUrl = (content: string): string | null => {
    // Look for PDF URLs that might be herdshare agreements
    const urlRegex = /https?:\/\/[^\s]+\.pdf/gi;
    const matches = content.match(urlRegex);
    if (matches && matches.length > 0) {
      // Check if the message contains herdshare-related keywords
      const herdshareKeywords = ["herdshare", "agreement", "dairy", "finalize"];
      const hasHerdshareContext = herdshareKeywords.some((keyword) =>
        content.toLowerCase().includes(keyword)
      );
      if (hasHerdshareContext) {
        return matches[0];
      }
    }
    return null;
  };

  const handlePdfPreviewClick = (pdfUrl: string) => {
    setCurrentPdfUrl(pdfUrl);
    setShowPdfModal(true);
  };

  const handleFinishSigning = async () => {
    if (!signer || !isLoggedIn || !currentPdfUrl) return;

    setIsUploading(true);
    try {
      // Extract product pubkey from message tags
      const tagsMap = new Map(
        messageEvent.tags
          .map((tag) => [tag[0], tag[1]])
          .filter(
            (pair): pair is [string, string] =>
              pair[0] !== undefined && pair[1] !== undefined
          )
      );

      // Get the product address (a tag) to extract the pubkey
      const productAddress = tagsMap.get("a") || tagsMap.get("item") || "";
      const productPubkey = productAddress
        ? productAddress.split(":")[1]
        : currentChatPubkey;

      if (!productPubkey) {
        throw new Error("Could not determine product owner pubkey");
      }

      // Fetch the original PDF
      const response = await fetch(currentPdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }

      const pdfBlob = await response.blob();

      // Process PDF with annotations using server-side service
      const formData = new FormData();
      formData.append("pdf", pdfBlob, "agreement.pdf");
      formData.append("annotations", JSON.stringify(annotations));

      console.log("Processing PDF with annotations:", annotations);

      const processResponse = await fetch("/api/process-pdf-annotations", {
        method: "POST",
        body: formData,
      });

      if (!processResponse.ok) {
        const errorText = await processResponse.text();
        console.error("PDF processing failed:", errorText);
        throw new Error(`PDF processing failed: ${processResponse.statusText}`);
      }

      const annotatedPdfBlob = await processResponse.blob();
      console.log(
        "PDF processed successfully, blob size:",
        annotatedPdfBlob.size
      );

      // Create a new filename with timestamp to indicate it's been "signed"
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File(
        [annotatedPdfBlob],
        `signed-agreement-${timestamp}.pdf`,
        {
          type: "application/pdf",
        }
      );

      // Upload the PDF with retry logic
      const { blossomServers } = getLocalStorageData();
      const servers =
        blossomServers && blossomServers.length > 0
          ? blossomServers
          : ["https://cdn.nostrcheck.me"];

      console.log("Uploading to servers:", servers);

      let uploadTags = null;
      let lastError = null;

      // Try each server until one succeeds
      for (const server of servers) {
        try {
          console.log("Trying server:", server);
          uploadTags = await blossomUpload(file, false, signer, [server]);
          if (uploadTags && Array.isArray(uploadTags)) {
            const url = uploadTags.find((tag) => tag[0] === "url")?.[1];
            if (url) {
              console.log("Upload successful to:", server);
              break;
            }
          }
        } catch (error) {
          console.error("Upload failed for server:", server, error);
          lastError = error;
          uploadTags = null;
        }
      }

      if (!uploadTags || !Array.isArray(uploadTags)) {
        throw new Error(
          `Upload failed to all servers. Last error: ${
            lastError instanceof Error ? lastError.message : "Unknown error"
          }`
        );
      }

      const signedPdfUrl = uploadTags.find((tag) => tag[0] === "url")?.[1];
      if (!signedPdfUrl) {
        throw new Error("Upload succeeded but no URL returned from server");
      }

      console.log("Final signed PDF URL:", signedPdfUrl);

      // Generate random keys for message wrapping
      const { nsec: randomNsecSender, npub: randomNpubSender } =
        await generateKeys();
      const { nsec: randomNsecReceiver, npub: randomNpubReceiver } =
        await generateKeys();

      const decodedRandomPubkeySender = nip19.decode(randomNpubSender);
      const decodedRandomPrivkeySender = nip19.decode(randomNsecSender);
      const decodedRandomPubkeyReceiver = nip19.decode(randomNpubReceiver);
      const decodedRandomPrivkeyReceiver = nip19.decode(randomNsecReceiver);

      // Send DM with signed PDF URL to the product owner
      const message = `Here is the signed herdshare agreement from ${userNpub}: ${signedPdfUrl}`;
      console.log("new", message);
      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        userPubkey!,
        productPubkey,
        message,
        "order-info"
      );

      const receiverSealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        userPubkey!,
        productPubkey
      );

      const senderSealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        userPubkey!,
        userPubkey!
      );

      const senderGiftWrappedEvent = await constructMessageGiftWrap(
        senderSealedEvent,
        decodedRandomPubkeySender.data as string,
        decodedRandomPrivkeySender.data as Uint8Array,
        userPubkey!
      );

      const receiverGiftWrappedEvent = await constructMessageGiftWrap(
        receiverSealedEvent,
        decodedRandomPubkeyReceiver.data as string,
        decodedRandomPrivkeyReceiver.data as Uint8Array,
        productPubkey
      );

      await sendGiftWrappedMessageEvent(senderGiftWrappedEvent);
      await sendGiftWrappedMessageEvent(receiverGiftWrappedEvent);

      setShowPdfModal(false);
      setCurrentPdfUrl("");
      setAnnotations([]); // Clear annotations after successful send
    } catch (error) {
      console.error("Failed to upload signed PDF:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Failed to upload signed PDF: ${errorMessage}. Please try again.`);
    } finally {
      setIsUploading(false);
    }
  };

  const renderMessageContent = (content: string) => {
    const herdsharePdfUrl = detectHerdsharePdfUrl(content);

    if (herdsharePdfUrl) {
      // Check if this message contains a signed agreement (regardless of who sent it)
      const isSignedAgreement = content
        .toLowerCase()
        .includes("signed herdshare agreement");

      const handleDownloadPdf = async () => {
        try {
          const response = await fetch(herdsharePdfUrl);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `signed-herdshare-agreement-${
            new Date().toISOString().split("T")[0]
          }.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } catch (error) {
          console.error("Failed to download PDF:", error);
          alert("Failed to download PDF. Please try again.");
        }
      };

      return (
        <div className="space-y-3">
          <div className="text-sm">{content.replace(herdsharePdfUrl, "")}</div>
          <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                {isSignedAgreement
                  ? "Signed Herdshare Agreement"
                  : "Herdshare Agreement"}
              </span>
            </div>
            <div
              className="h-32 w-full cursor-pointer overflow-hidden rounded border"
              onClick={() =>
                isSignedAgreement
                  ? handleDownloadPdf()
                  : handlePdfPreviewClick(herdsharePdfUrl)
              }
            >
              <iframe
                src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(
                  herdsharePdfUrl
                )}`}
                className="pointer-events-none h-full w-full"
                title="PDF Preview"
                style={{
                  transform: "scale(0.5)",
                  transformOrigin: "top left",
                  width: "200%",
                  height: "200%",
                }}
              />
            </div>
            <Button
              size="sm"
              className="mt-2 w-full"
              color={isSignedAgreement ? "success" : "warning"}
              onClick={() =>
                isSignedAgreement
                  ? handleDownloadPdf()
                  : handlePdfPreviewClick(herdsharePdfUrl)
              }
            >
              {isSignedAgreement
                ? "Download for Your Records"
                : "View & Sign Agreement"}
            </Button>
          </div>
        </div>
      );
    }

    const words = content.split(/(\s+)/);
    return words.map((word, index) => {
      const npubMatch = word.match(/npub[a-zA-Z0-9]+/);
      if (npubMatch) {
        return (
          <span
            key={index}
            className="cursor-pointer text-yellow-600 hover:underline"
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
              ? "rounded-bl-lg bg-gray-300 text-light-text"
              : "rounded-br-lg bg-gray-600 text-dark-text"
          }`}
        >
          <div className="inline-block flex-wrap overflow-x-hidden break-all">
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

      {/* PDF Signing Modal */}
      {showPdfModal && currentPdfUrl && (
        <Modal
          isOpen={showPdfModal}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setShowPdfModal(false);
              setCurrentPdfUrl("");
              setAnnotations([]);
            }
          }}
          size="5xl"
          scrollBehavior="inside"
          classNames={{
            body: "py-6 bg-dark-fg",
            backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
            header: "border-b-[1px] border-[#292f46] bg-dark-fg rounded-t-lg",
            footer: "border-t-[1px] border-[#292f46] bg-dark-fg rounded-b-lg",
            closeButton: "hover:bg-black/5 active:bg-white/10",
          }}
          className="max-h-[90vh]"
        >
          <ModalContent className="flex h-full flex-col">
            <ModalHeader className="flex-shrink-0 border-b bg-white">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="h-5 w-5" />
                Review & Sign Agreement
              </div>
            </ModalHeader>
            <ModalBody className="flex flex-grow flex-col p-4">
              <div className="flex h-full flex-col rounded-lg border bg-white">
                <div className="flex-grow overflow-auto p-4">
                  <PDFAnnotator
                    pdfUrl={currentPdfUrl}
                    annotations={annotations}
                    onAnnotationsChange={setAnnotations}
                  />
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="flex-shrink-0 border-t bg-gray-50">
              <div className="flex w-full justify-end gap-3">
                <Button
                  color="default"
                  variant="light"
                  onPress={() => {
                    setShowPdfModal(false);
                    setCurrentPdfUrl("");
                    setAnnotations([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  color="warning"
                  onPress={handleFinishSigning}
                  isLoading={isUploading}
                  disabled={isUploading}
                >
                  {isUploading ? "Processing..." : "Finish Signing"}
                </Button>
              </div>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </>
  );
};

export default ChatMessage;
