import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@nextui-org/react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { SimplePool } from "nostr-tools";
import parseTags, {
  ProductData,
} from "../../components/utility/product-parser-functions";
import ListingPage from "../../components/listing-page";
import { getLocalStorageData } from "../../components/utility/nostr-helper-functions";

const Listing = () => {
  const router = useRouter();
  const [relays, setRelays] = useState<string[]>([]);
  const [productData, setProductData] = useState<ProductData | undefined>(
    undefined,
  );
  const [productIdString, setProductIdString] = useState("");

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  useEffect(() => {
    if (router.isReady) {
      const { productId } = router.query;
      const productIdString = productId ? productId[0] : "";
      setProductIdString(productIdString);
      if (!productIdString) {
        router.push("/"); // if there isn't a productId, redirect to home page
      }
      let { relays } = getLocalStorageData();
      setRelays(relays);
    }
  }, [router]);

  useEffect(() => {
    const pool = new SimplePool();

    let subParams: { ids: string[]; kinds: number[] } = {
      ids: [productIdString],
      kinds: [30402],
    };

    let h = pool.subscribeMany(relays, [subParams], {
      onevent(event) {
        const productData = parseTags(event);
        setProductData(productData);
      },
      oneose() {
        h.close();
      },
    });
  }, [relays]);

  const imageUrl = productData?.images?.length
    ? productData.images[0]
    : "/shopstr-2000x2000.png";

  return (
    <>
      <Head>
        <title>Shopstr</title>
        <meta name="description" content={productData?.title} />
        <meta
          property="og:url"
          content={`https://shopstr.store/listing/${productData?.id}`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Shopstr" />
        <meta property="og:description" content={productData?.title} />
        <meta property="og:image" content={imageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="shopstr.store" />
        <meta
          property="twitter:url"
          content={`https://shopstr.store/listing/${productData?.id}`}
        />
        <meta name="twitter:title" content="Shopstr" />
        <meta name="twitter:description" content={productData?.title} />
        <meta name="twitter:image" content={imageUrl} />
      </Head>
      <div className="flex h-full min-h-screen flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
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
                router.push("/");
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
                    The seller should have received a DM containing a Cashu
                    token payment.
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
