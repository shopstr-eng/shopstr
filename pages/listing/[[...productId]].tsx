import React, { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Textarea, useDisclosure } from "@nextui-org/react";
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import parseTags, { ProductData } from "@/utils/parsers/product-parser-functions";
import CheckoutCard from "../../components/utility-components/checkout-card";
import { ProductContext } from "@/utils/context/context";
import { NostrContext, SignerContext } from "@/components/utility-components/nostr-context-provider";
import { activateDispute } from "@/utils/nostr/nostr-helper-functions"; 
import { Event, nip19 } from "nostr-tools";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const Listing = () => {
  const router = useRouter();
  const [productData, setProductData] = useState<ProductData | undefined>(undefined);
  const [productIdString, setProductIdString] = useState("");

  const [fiatOrderIsPlaced, setFiatOrderIsPlaced] = useState(false);
  const [fiatOrderFailed, setFiatOrderFailed] = useState(false);
  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const [isBuyer, setIsBuyer] = useState(false);
  const {isOpen: isDisputeModalOpen, onOpen: onDisputeModalOpen, onClose: onDisputeModalClose} = useDisclosure();
  const [disputeReason, setDisputeReason] = useState("");

  const productContext = useContext(ProductContext);
  const { nostr } = useContext(NostrContext);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  useEffect(() => {
    if (router.isReady) {
      const { productId } = router.query;
      const productIdString = productId ? productId[0] : "";
      setProductIdString(productIdString!);
      if (!productIdString) {
        router.push("/marketplace");
      }
    }
  }, [router]);

  useEffect(() => {
    if (!productContext.isLoading && productContext.productEvents) {
      const matchingEvent = productContext.productEvents.find(
        (event: Event) => {
          const naddrMatch =
            nip19.naddrEncode({
              identifier: event.tags.find((tag: string[]) => tag[0] === "d")?.[1] || "",
              pubkey: event.pubkey,
              kind: event.kind,
            }) === productIdString;
          const dTagMatch = event.tags.find((tag: string[]) => tag[0] === "d")?.[1] === productIdString;
          const idMatch = event.id === productIdString;
          return naddrMatch || dTagMatch || idMatch;
        }
      );

      if (matchingEvent) {
        const parsed = parseTags(matchingEvent);
        setProductData(parsed);
      }
    }
  }, [productContext.productEvents, productContext.isLoading, productIdString]);

  useEffect(() => {
    // Once a payment is successful, we know the current user is the buyer.
    if (invoiceIsPaid || cashuPaymentSent) {
      setIsBuyer(true);
    }
  }, [invoiceIsPaid, cashuPaymentSent]);

  const handleActivateDispute = async () => {
    if (!productData || !userPubkey || !signer || !nostr || !disputeReason.trim()) {
      alert("Cannot open dispute. Missing required information.");
      return;
    }
    try {
      await activateDispute(nostr, signer, productData.d!, disputeReason, userPubkey!, productData.pubkey!);
      onDisputeModalClose();
      router.push('/orders?tab=disputes');
    } catch (error) {
      console.error("Failed to activate dispute:", error);
      alert("There was an error opening the dispute. Please try again.");
    }
  };

  return (
    <>
      <div className="flex h-full min-h-screen flex-col bg-light-bg pt-20 dark:bg-dark-bg">
        {productData && (
          <CheckoutCard
            productData={productData}
            setFiatOrderIsPlaced={setFiatOrderIsPlaced}
            setFiatOrderFailed={setFiatOrderFailed}
            setInvoiceIsPaid={setInvoiceIsPaid}
            setInvoiceGenerationFailed={setInvoiceGenerationFailed}
            setCashuPaymentSent={setCashuPaymentSent}
            setCashuPaymentFailed={setCashuPaymentFailed}
          />
        )}

        {isBuyer && (
          <div className="mx-auto mt-8 max-w-2xl rounded-lg border-2 border-dashed border-red-500 p-6 text-center">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
            <h3 className="mt-2 text-lg font-medium text-light-text dark:text-dark-text">Problem with your order?</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">If you have an issue with this transaction, you can open a dispute to begin mediation.</p>
            <Button color="danger" variant="ghost" className="mt-4" onClick={onDisputeModalOpen}>
              Open a Dispute
            </Button>
          </div>
        )}

        <Modal isOpen={isDisputeModalOpen} onClose={onDisputeModalClose} backdrop="blur">
          <ModalContent>
            <ModalHeader>Open a Dispute</ModalHeader>
            <ModalBody>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Please briefly describe the reason for opening this dispute. This will be visible to the seller and the arbiter.
              </p>
              <Textarea
                label="Reason for Dispute"
                placeholder="e.g., Item not received, item not as described..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onClick={onDisputeModalClose}>
                Cancel
              </Button>
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={handleActivateDispute}
                isDisabled={!disputeReason.trim()}
              >
                Submit Dispute
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* --- Existing Modals for Payment Status --- */}
        {invoiceIsPaid || cashuPaymentSent ? (
          <>
            <Modal
              backdrop="blur"
              isOpen={fiatOrderIsPlaced || invoiceIsPaid || cashuPaymentSent}
              onClose={() => {
                setFiatOrderIsPlaced(false);
                setInvoiceIsPaid(false);
                setCashuPaymentSent(false);
                router.push("/orders");
              }}
              classNames={{
                body: "py-6 ",
                backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                header: "border-b-[1px] border-[#292f46]",
                footer: "border-t-[1px] border-[#292f46]",
                closeButton: "hover:bg-black/5 active:bg-white/10",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                  <CheckCircleIcon className="h-6 w-6 text-green-500" />
                  <div className="ml-2">Order successful!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                  <div className="flex items-center justify-center">
                    The seller will receive a message with your order details.
                  </div>
                </ModalBody>
              </ModalContent>
            </Modal>
          </>
        ) : null}
        {invoiceGenerationFailed ? (
          <>
            <Modal
              backdrop="blur"
              isOpen={invoiceGenerationFailed}
              onClose={() => setInvoiceGenerationFailed(false)}
              classNames={{
                body: "py-6 ",
                backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                header: "border-b-[1px] border-[#292f46]",
                footer: "border-t-[1px] border-[#292f46]",
                closeButton: "hover:bg-black/5 active:bg-white/10",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Invoice generation failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                  <div className="flex items-center justify-center">
                    The price and/or currency set for this listing was invalid.
                  </div>
                </ModalBody>
              </ModalContent>
            </Modal>
          </>
        ) : null}
        {cashuPaymentFailed ? (
          <>
            <Modal
              backdrop="blur"
              isOpen={cashuPaymentFailed}
              onClose={() => setCashuPaymentFailed(false)}
              classNames={{
                body: "py-6 ",
                backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                header: "border-b-[1px] border-[#292f46]",
                footer: "border-t-[1px] border-[#292f46]",
                closeButton: "hover:bg-black/5 active:bg-white/10",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Purchase failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                  <div className="flex items-center justify-center">
                    You didn&apos;t have enough balance in your wallet to pay.
                  </div>
                </ModalBody>
              </ModalContent>
            </Modal>
          </>
        ) : null}
        {fiatOrderFailed ? (
          <>
            <Modal
              backdrop="blur"
              isOpen={fiatOrderFailed}
              onClose={() => setFiatOrderFailed(false)}
              // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
              classNames={{
                body: "py-6 ",
                backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                header: "border-b-[1px] border-[#292f46]",
                footer: "border-t-[1px] border-[#292f46]",
                closeButton: "hover:bg-black/5 active:bg-white/10",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Order failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                  <div className="flex items-center justify-center">
                    Your order information was not delivered to the seller.
                    Please try again.
                  </div>
                </ModalBody>
              </ModalContent>
            </Modal>
          </>
        ) : null}
      </div>
    </>
  );
};

export default Listing;
