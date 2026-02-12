import React, { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from "@nextui-org/react";
import {
  CheckCircleIcon,
  XCircleIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { parseZapsnagNote } from "@/utils/parsers/zapsnag-parser";
import CheckoutCard from "../../components/utility-components/checkout-card";
import ZapsnagButton from "../../components/ZapsnagButton";
import { ProductContext } from "../../utils/context/context";
import { Event, nip19 } from "nostr-tools";
import {
  RawEventModal,
  EventIdModal,
} from "../../components/utility-components/modals/event-modals";

const Listing = () => {
  const router = useRouter();
  const [productData, setProductData] = useState<ProductData | undefined>(
    undefined
  );
  const [isZapsnag, setIsZapsnag] = useState(false);
  const [productIdString, setProductIdString] = useState("");
  const [rawEvent, setRawEvent] = useState<Event | undefined>(undefined);
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);

  const [fiatOrderIsPlaced, setFiatOrderIsPlaced] = useState(false);
  const [fiatOrderFailed, setFiatOrderFailed] = useState(false);
  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const productContext = useContext(ProductContext);

  useEffect(() => {
    if (router.isReady) {
      const { productId } = router.query;
      const productIdString = productId ? productId[0] : "";
      setProductIdString(productIdString!);
      if (!productIdString) {
        router.push("/marketplace"); // if there isn't a productId, redirect to home page
      }
    }
  }, [router]);

  useEffect(() => {
    if (!productContext.isLoading && productContext.productEvents) {
      const matchingEvent = productContext.productEvents.find(
        (event: Event) => {
          // check for matching naddr
          const naddrMatch =
            nip19.naddrEncode({
              identifier:
                event.tags.find((tag: string[]) => tag[0] === "d")?.[1] || "",
              pubkey: event.pubkey,
              kind: event.kind,
            }) === productIdString;

          // Check for matching d tag
          const dTagMatch =
            event.tags.find((tag: string[]) => tag[0] === "d")?.[1] ===
            productIdString;
          // Check for matching event id
          const idMatch = event.id === productIdString;
          return naddrMatch || dTagMatch || idMatch;
        }
      );

      if (matchingEvent) {
        setRawEvent(matchingEvent);
        let parsed;
        if (matchingEvent.kind === 1) {
          parsed = parseZapsnagNote(matchingEvent);
          setIsZapsnag(true);
        } else {
          parsed = parseTags(matchingEvent);
          setIsZapsnag(false);
        }
        setProductData(parsed);
      }
    }
  }, [productContext.isLoading, productContext.productEvents, productIdString]);

  return (
    <>
      <div className="flex h-full min-h-screen flex-col bg-[#111] pt-20">
        {productData &&
          (isZapsnag ? (
            <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#161616]">
                <img
                  src={productData.images[0]}
                  className="h-64 md:h-96 w-full object-cover"
                />
                <div className="p-6">
                  <div className="mb-2 flex items-start justify-between">
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-white">
                      {productData.title}
                    </h1>
                    {rawEvent && (
                      <Dropdown
                        classNames={{
                          content:
                            "bg-[#161616] border border-zinc-800 rounded-xl",
                        }}
                      >
                        <DropdownTrigger>
                          <Button
                            isIconOnly
                            variant="light"
                            size="sm"
                            className="text-zinc-400 hover:text-white"
                          >
                            <EllipsisVerticalIcon className="h-6 w-6" />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label="Event Actions">
                          <DropdownItem
                            key="view-raw"
                            onPress={() => setShowRawEventModal(true)}
                          >
                            View Raw Event
                          </DropdownItem>
                          <DropdownItem
                            key="view-id"
                            onPress={() => setShowEventIdModal(true)}
                          >
                            View Event ID
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </div>
                  <p className="mb-6 whitespace-pre-wrap text-zinc-400">
                    {productData.summary}
                  </p>
                  <ZapsnagButton product={productData} />
                </div>
              </div>

              {/* Raw Event Modal */}
              <RawEventModal
                isOpen={showRawEventModal}
                onClose={() => setShowRawEventModal(false)}
                rawEvent={rawEvent}
              />

              {/* Event ID Modal */}
              <EventIdModal
                isOpen={showEventIdModal}
                onClose={() => setShowEventIdModal(false)}
                rawEvent={rawEvent}
              />
            </div>
          ) : (
            <CheckoutCard
              productData={productData}
              setFiatOrderIsPlaced={setFiatOrderIsPlaced}
              setFiatOrderFailed={setFiatOrderFailed}
              setInvoiceIsPaid={setInvoiceIsPaid}
              setInvoiceGenerationFailed={setInvoiceGenerationFailed}
              setCashuPaymentSent={setCashuPaymentSent}
              setCashuPaymentFailed={setCashuPaymentFailed}
              rawEvent={rawEvent}
            />
          ))}
        {fiatOrderIsPlaced || invoiceIsPaid || cashuPaymentSent ? (
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
                base: "bg-[#161616] border border-zinc-800 rounded-2xl",
                body: "py-8",
                backdrop: "bg-black/80 backdrop-blur-sm",
                header: "border-b border-zinc-800 text-white",
                closeButton: "hover:bg-white/10 text-white",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="md"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                  <CheckCircleIcon className="h-6 w-6 text-green-500" />
                  <div className="ml-2">Order successful!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
                base: "bg-[#161616] border border-zinc-800 rounded-2xl",
                body: "py-8",
                backdrop: "bg-black/80 backdrop-blur-sm",
                header: "border-b border-zinc-800 text-white",
                closeButton: "hover:bg-white/10 text-white",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="md"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Invoice generation failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
                base: "bg-[#161616] border border-zinc-800 rounded-2xl",
                body: "py-8",
                backdrop: "bg-black/80 backdrop-blur-sm",
                header: "border-b border-zinc-800 text-white",
                closeButton: "hover:bg-white/10 text-white",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="md"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Purchase failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
              classNames={{
                base: "bg-[#161616] border border-zinc-800 rounded-2xl",
                body: "py-8",
                backdrop: "bg-black/80 backdrop-blur-sm",
                header: "border-b border-zinc-800 text-white",
                closeButton: "hover:bg-white/10 text-white",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="md"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Order failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
