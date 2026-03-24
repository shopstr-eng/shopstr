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
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ChatsContext } from "@/utils/context/context";
import {
  blossomUpload,
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  generateKeys,
  getLocalStorageData,
} from "../../utils/nostr/nostr-helper-functions";
import { viewEncryptedAgreement } from "@/utils/encryption/agreement-viewer";
import { encryptFileWithNip44 } from "@/utils/encryption/file-encryption";
import FailureModal from "../utility-components/failure-modal";

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
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingAgreement, setIsLoadingAgreement] = useState(false);
  const {
    pubkey: userPubkey,
    npub: userNpub,
    signer,
    isLoggedIn,
  } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const chatsContext = useContext(ChatsContext);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

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
  } catch (e) {}

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

      // First, process annotations on the original PDF
      const formData = new FormData();
      formData.append("pdf", pdfBlob, "agreement.pdf");
      formData.append("annotations", JSON.stringify(annotations));

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

      // Now encrypt the annotated PDF using buyer's signature and seller's npub
      const sellerNpub = nip19.npubEncode(productPubkey);
      const encryptedFile = await encryptFileWithNip44(
        new File([annotatedPdfBlob], "signed-agreement.pdf", {
          type: "application/pdf",
        }),
        sellerNpub,
        true,
        signer
      );

      const encryptedPdfBlob = encryptedFile;

      // Create a new filename with timestamp to indicate it's been "signed"
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File(
        [encryptedPdfBlob],
        `encrypted-signed-agreement-${timestamp}.pdf`,
        {
          type: "application/pdf",
        }
      );

      // Upload the encrypted PDF with retry logic
      const { blossomServers } = getLocalStorageData();
      const servers =
        blossomServers && blossomServers.length > 0
          ? blossomServers
          : ["https://cdn.nostrcheck.me"];

      let uploadTags = null;
      let lastError = null;

      // Try each server until one succeeds
      for (const server of servers) {
        try {
          uploadTags = await blossomUpload(file, false, signer, [server]);
          if (uploadTags && Array.isArray(uploadTags)) {
            const url = uploadTags.find((tag) => tag[0] === "url")?.[1];
            if (url) {
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
      const message = `Here is the encrypted signed herdshare agreement from ${userNpub}: ${signedPdfUrl}`;
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

      await sendGiftWrappedMessageEvent(nostr!, senderGiftWrappedEvent);
      await sendGiftWrappedMessageEvent(nostr!, receiverGiftWrappedEvent);

      chatsContext.addNewlyCreatedMessageEvent(
        {
          ...giftWrappedMessageEvent,
          sig: "",
          read: false,
        },
        true
      );

      setShowPdfModal(false);
      setCurrentPdfUrl("");
      setAnnotations([]); // Clear annotations after successful send
    } catch (error) {
      console.error("Failed to upload signed PDF:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      setFailureText(
        `Failed to upload signed PDF: ${errorMessage}. Please try again.`
      );
      setShowFailureModal(true);
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
      const isEncryptedAgreement =
        content.toLowerCase().includes("encrypted herdshare agreement") ||
        content
          .toLowerCase()
          .includes("encrypted signed herdshare agreement") ||
        (content.toLowerCase().includes("encrypted") &&
          content.toLowerCase().includes("agreement"));

      const handleDownloadPdf = async () => {
        setIsDownloading(true);
        try {
          const isEncrypted = await checkIfPdfIsEncrypted(herdsharePdfUrl);

          let blobToDownload: Blob;

          if (isEncrypted) {
            if (!signer || !isLoggedIn) {
              setFailureText("Please log in to download encrypted agreements.");
              setShowFailureModal(true);
              return;
            }

            const sellerNpub = getSellerNpubFromTags();

            // Use peer-to-peer decryption for signed agreements (download)
            // Use server-side decryption for unsigned agreements
            const usePeerToPeerDecryption = isSignedAgreement;

            blobToDownload = await viewEncryptedAgreement(
              herdsharePdfUrl,
              sellerNpub,
              usePeerToPeerDecryption ? signer : undefined
            );

            if (!blobToDownload || blobToDownload.size === 0) {
              setFailureText(
                "Failed to decrypt agreement or received empty data."
              );
              setShowFailureModal(true);
              return;
            }

            await validatePdfBlob(blobToDownload);
          } else {
            const response = await fetch(herdsharePdfUrl);
            blobToDownload = await response.blob();
          }

          const url = window.URL.createObjectURL(blobToDownload);
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
          setFailureText("Failed to download PDF: " + (error as Error).message);
          setShowFailureModal(true);
        } finally {
          setIsDownloading(false);
        }
      };

      const checkIfPdfIsEncrypted = async (url: string): Promise<boolean> => {
        try {
          const testResponse = await fetch(url);
          const testBuffer = await testResponse.arrayBuffer();
          const testArray = new Uint8Array(testBuffer);
          const header = String.fromCharCode(...testArray.slice(0, 4));
          return header !== "%PDF";
        } catch (error) {
          console.error("Error checking PDF encryption status:", error);
          return false;
        }
      };

      const getSellerNpubFromTags = (): string => {
        const tagsMap = new Map(
          messageEvent.tags
            .map((tag) => [tag[0], tag[1]])
            .filter(
              (pair): pair is [string, string] =>
                pair[0] !== undefined && pair[1] !== undefined
            )
        );

        const productAddress = tagsMap.get("a") || tagsMap.get("item") || "";
        const sellerPubkey = productAddress
          ? productAddress.split(":")[1]
          : currentChatPubkey;

        if (!sellerPubkey) {
          throw new Error("Could not determine seller's pubkey for decryption");
        }

        return nip19.npubEncode(sellerPubkey);
      };

      const validatePdfBlob = async (blob: Blob): Promise<void> => {
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const pdfHeader = String.fromCharCode(...uint8Array.slice(0, 4));
        if (pdfHeader !== "%PDF") {
          throw new Error(
            `Invalid PDF header. Expected %PDF, got: ${pdfHeader}`
          );
        }

        const firstLine = String.fromCharCode(...uint8Array.slice(0, 8));
        if (!firstLine.startsWith("%PDF-1.")) {
          throw new Error(
            `Invalid PDF version. Expected %PDF-1.x, got: ${firstLine}`
          );
        }
      };

      const handleViewSigningModal = async () => {
        setIsLoadingAgreement(true);
        try {
          const isEncrypted = await checkIfPdfIsEncrypted(herdsharePdfUrl);

          if (isEncrypted) {
            if (!signer || !isLoggedIn) {
              setFailureText("Please log in to view encrypted agreements.");
              setShowFailureModal(true);
              return;
            }

            const sellerNpub = getSellerNpubFromTags();

            // Always use server-side decryption for review and sign - don't pass signer
            const decryptedBlob = await viewEncryptedAgreement(
              herdsharePdfUrl,
              sellerNpub
            );

            if (!decryptedBlob || decryptedBlob.size === 0) {
              setFailureText(
                "Failed to decrypt agreement or received empty data."
              );
              setShowFailureModal(true);
              return;
            }

            await validatePdfBlob(decryptedBlob);

            const blobUrl = URL.createObjectURL(decryptedBlob);

            setCurrentPdfUrl(blobUrl);
            setShowPdfModal(true);
          } else {
            setCurrentPdfUrl(herdsharePdfUrl);
            setShowPdfModal(true);
          }
        } catch (error) {
          console.error("Error in handleViewSigningModal:", error);
          setFailureText(
            "An error occurred while trying to view the agreement: " +
              (error as Error).message
          );
          setShowFailureModal(true);
        } finally {
          setIsLoadingAgreement(false);
        }
      };

      return (
        <div className="space-y-3">
          <div className="text-sm">{content.replace(herdsharePdfUrl, "")}</div>
          <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                {isEncryptedAgreement
                  ? content.toLowerCase().includes("signed")
                    ? "Encrypted Signed Herdshare Agreement"
                    : "Encrypted Herdshare Agreement"
                  : isSignedAgreement
                    ? "Signed Herdshare Agreement"
                    : "Herdshare Agreement"}
              </span>
            </div>

            <Button
              size="sm"
              className={`mt-2 w-full ${
                isSignedAgreement ? "text-dark-text" : "text-light-text"
              }`}
              color={
                isSignedAgreement
                  ? "success"
                  : isEncryptedAgreement
                    ? "primary"
                    : "warning"
              }
              onClick={() =>
                isSignedAgreement
                  ? handleDownloadPdf()
                  : handleViewSigningModal()
              }
              isLoading={
                (isSignedAgreement && isDownloading) ||
                (!isSignedAgreement && isLoadingAgreement)
              }
              disabled={
                (isSignedAgreement && isDownloading) ||
                (!isSignedAgreement && isLoadingAgreement)
              }
            >
              {isSignedAgreement
                ? isDownloading
                  ? "Preparing Download..."
                  : "Download for Your Records"
                : isLoadingAgreement
                  ? "Preparing Agreement..."
                  : isEncryptedAgreement
                    ? content.toLowerCase().includes("signed")
                      ? "View Encrypted Signed Agreement"
                      : "View Encrypted Agreement"
                    : "Review & Sign Agreement"}
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
          className={`flex max-w-[90%] flex-col rounded-lg px-4 py-3 ${
            isUserMessage
              ? "bg-[#E6C84F] text-black"
              : "bg-[#2C3E50] text-white"
          }`}
        >
          <div className="inline-block flex-wrap overflow-x-hidden break-normal">
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
              <div className="flex flex-col gap-2 border-l-4 border-yellow-600 pl-3">
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
        </div>
        <div className="m-1"></div>
        <span
          className={`text-xs opacity-60 ${
            isUserMessage ? "text-right" : "text-left"
          }`}
        >
          {timeSinceMessageDisplayText(messageEvent.created_at).dateTime}
        </span>
      </div>

      {/* PDF Signing Modal */}
      {showPdfModal && currentPdfUrl && (
        <Modal
          isOpen={showPdfModal}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setShowPdfModal(false);
              // Clean up blob URL if it exists
              if (currentPdfUrl && currentPdfUrl.startsWith("blob:")) {
                URL.revokeObjectURL(currentPdfUrl);
              }
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
                    // Clean up blob URL if it exists
                    if (currentPdfUrl && currentPdfUrl.startsWith("blob:")) {
                      URL.revokeObjectURL(currentPdfUrl);
                    }
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

      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </>
  );
};

export default ChatMessage;
