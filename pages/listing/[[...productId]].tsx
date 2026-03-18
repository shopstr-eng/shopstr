import { useState, useEffect, useContext } from "react";
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
import { findProductBySlug, getListingSlug } from "@/utils/url-slugs";

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
        router.push("/marketplace");
      }
    }
  }, [router]);

  useEffect(() => {
    if (!productContext.isLoading && productContext.productEvents) {
      const allParsed = productContext.productEvents
        .filter((e: Event) => e.kind !== 1)
        .map((e: Event) => parseTags(e))
        .filter((p: ProductData | undefined): p is ProductData => !!p);

      let matchingEvent: Event | undefined;

      const slugMatch = findProductBySlug(productIdString, allParsed);
      if (slugMatch) {
        matchingEvent = productContext.productEvents.find(
          (e: Event) => e.id === slugMatch.id
        );
      }

      if (!matchingEvent) {
        matchingEvent = productContext.productEvents.find((event: Event) => {
          const naddrMatch =
            nip19.naddrEncode({
              identifier:
                event.tags.find((tag: string[]) => tag[0] === "d")?.[1] || "",
              pubkey: event.pubkey,
              kind: event.kind,
            }) === productIdString;

          const dTagMatch =
            event.tags.find((tag: string[]) => tag[0] === "d")?.[1] ===
            productIdString;
          const idMatch = event.id === productIdString;
          return naddrMatch || dTagMatch || idMatch;
        });
      }

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

        if (parsed && parsed.title && matchingEvent.kind !== 1) {
          const canonicalSlug = getListingSlug(parsed, allParsed);
          if (canonicalSlug && productIdString !== canonicalSlug) {
            router.replace(`/listing/${canonicalSlug}`, undefined, {
              shallow: true,
            });
          }
        }
      }
    }
  }, [productContext.isLoading, productContext.productEvents, productIdString]);

  return (
    <>
      <div className="flex h-full min-h-screen flex-col bg-light-bg pt-20 dark:bg-dark-bg">
        {productData &&
          (isZapsnag ? (
            <div className="mx-auto w-full max-w-2xl p-6">
              <div className="overflow-hidden rounded-xl bg-white shadow-lg dark:bg-neutral-900">
                <img
                  src={productData.images[0]}
                  className="h-96 w-full object-cover"
                />
                <div className="p-6">
                  <div className="mb-2 flex items-start justify-between">
                    <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">
                      {productData.title}
                    </h1>
                    {rawEvent && (
                      <Dropdown>
                        <DropdownTrigger>
                          <Button isIconOnly variant="light" size="sm">
                            <EllipsisVerticalIcon className="h-6 w-6 text-gray-500" />
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
                  <p className="mb-6 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
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
              setInvoiceIsPaid={setInvoiceIsPaid}
              setInvoiceGenerationFailed={setInvoiceGenerationFailed}
              setCashuPaymentSent={setCashuPaymentSent}
              setCashuPaymentFailed={setCashuPaymentFailed}
              rawEvent={rawEvent}
            />
          ))}
        {invoiceIsPaid || cashuPaymentSent ? (
          <>
            <Modal
              backdrop="blur"
              isOpen={invoiceIsPaid || cashuPaymentSent}
              onClose={() => {
                setInvoiceIsPaid(false);
                setCashuPaymentSent(false);
                router.push("/order-summary");
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
