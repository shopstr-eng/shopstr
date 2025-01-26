import React, { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@nextui-org/react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import parseTags, {
  ProductData,
} from "../../components/utility/product-parser-functions";
import ListingPage from "../../components/listing-page";
import { ProductContext } from "../../utils/context/context";
import { Event } from "nostr-tools";

const Listing = () => {
  const router = useRouter();
  const [productData, setProductData] = useState<ProductData | undefined>(
    undefined,
  );
  const [productIdString, setProductIdString] = useState("");

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const productContext = useContext(ProductContext);

  useEffect(() => {
    if (router.isReady) {
      const { productId } = router.query;
      const productIdString = productId ? productId[0] : "";
      setProductIdString(productIdString);
      if (!productIdString) {
        router.push("/marketplace"); // if there isn't a productId, redirect to home page
      }
    }
  }, [router]);

  useEffect(() => {
    if (!productContext.isLoading && productContext.productEvents) {
      const matchingEvent = productContext.productEvents.find(
        (event: Event) => {
          // Check for matching d tag
          const dTagMatch =
            event.tags.find((tag: string[]) => tag[0] === "d")?.[1] ===
            productIdString;
          // Check for matching event id
          const idMatch = event.id === productIdString;
          return dTagMatch || idMatch;
        },
      );

      if (matchingEvent) {
        const parsed = parseTags(matchingEvent);
        setProductData(parsed);
      }
    }
  }, [productContext.isLoading, productContext.productEvents, productIdString]);

  return (
    <>
      <div className="flex h-full min-h-screen flex-col bg-light-bg pt-20 dark:bg-dark-bg">
        {productData && (
          <ListingPage
            productData={productData}
            setInvoiceIsPaid={setInvoiceIsPaid}
            setInvoiceGenerationFailed={setInvoiceGenerationFailed}
            setCashuPaymentSent={setCashuPaymentSent}
            setCashuPaymentFailed={setCashuPaymentFailed}
          />
        )}
        {invoiceIsPaid || cashuPaymentSent ? (
          <>
            <Modal
              backdrop="blur"
              isOpen={invoiceIsPaid || cashuPaymentSent}
              onClose={() => {
                setInvoiceIsPaid(false);
                setCashuPaymentSent(false);
                router.push("/marketplace");
              }}
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
                  <CheckCircleIcon className="h-6 w-6 text-green-500" />
                  <div className="ml-2">Purchase successful!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                  <div className="flex items-center justify-center">
                    The seller will receive a DM containing your payment as a
                    Cashu token.
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
      </div>
    </>
  );
};

export default Listing;
