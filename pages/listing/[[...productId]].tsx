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
import StorefrontThemeWrapper from "@/components/storefront/storefront-theme-wrapper";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import {
  fetchProductByIdFromDb,
  fetchProductByDTagAndPubkey,
  fetchProductByTitleSlug,
} from "@/utils/db/db-service";

type ListingPageProps = {
  ogMeta: OgMetaProps;
};

function eventToOgMeta(
  event: import("@/utils/types/types").NostrEvent,
  urlPath: string
): OgMetaProps {
  const productData = parseTags(event);
  if (productData) {
    return {
      title: productData.title || "Milk Market Listing",
      description:
        productData.summary || "Check out this product on Milk Market!",
      image: productData.images?.[0] || "/milk-market.png",
      url: urlPath,
    };
  }
  return {
    ...DEFAULT_OG,
    title: "Milk Market Listing",
    description: "Check out this listing on Milk Market!",
    url: urlPath,
  };
}

const LISTING_FALLBACK: OgMetaProps = {
  ...DEFAULT_OG,
  title: "Milk Market Listing",
  description: "Check out this listing on Milk Market!",
};

export const getServerSideProps: GetServerSideProps<ListingPageProps> = async (
  context
) => {
  const { productId } = context.query;
  const identifier = Array.isArray(productId) ? productId[0] : productId;

  if (!identifier) {
    return { props: { ogMeta: LISTING_FALLBACK } };
  }

  const urlPath = `/listing/${identifier}`;

  try {
    if (identifier.startsWith("naddr1")) {
      try {
        const decoded = nip19.decode(identifier);
        if (decoded.type === "naddr") {
          const event = await fetchProductByDTagAndPubkey(
            decoded.data.identifier,
            decoded.data.pubkey
          );
          if (event)
            return { props: { ogMeta: eventToOgMeta(event, urlPath) } };
        }
      } catch {}
      return { props: { ogMeta: { ...LISTING_FALLBACK, url: urlPath } } };
    }

    const eventById = await fetchProductByIdFromDb(identifier);
    if (eventById)
      return { props: { ogMeta: eventToOgMeta(eventById, urlPath) } };

    const eventBySlug = await fetchProductByTitleSlug(identifier);
    if (eventBySlug)
      return { props: { ogMeta: eventToOgMeta(eventBySlug, urlPath) } };
  } catch (error) {
    console.error("SSR OG fetch error for listing:", error);
  }

  return { props: { ogMeta: { ...LISTING_FALLBACK, url: urlPath } } };
};

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

  const sellerPubkey = productData?.pubkey || "";

  const listingContent = (
    <>
      <div className="flex h-full min-h-screen flex-col bg-white pt-20">
        {productData &&
          (isZapsnag ? (
            <div className="mx-auto w-full max-w-2xl p-6">
              <div className="overflow-hidden rounded-xl bg-white shadow-lg">
                <img
                  src={productData.images[0]}
                  className="h-96 w-full object-cover"
                />
                <div className="p-6">
                  <div className="justify-dark mb-2 flex items-start">
                    <h1 className="text-2xl font-bold text-black">
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
                  <p className="mb-6 whitespace-pre-wrap text-gray-600">
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
              key={productData.id}
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
                const sfSlug = sessionStorage.getItem("sf_shop_slug");
                const sfPk = sessionStorage.getItem("sf_seller_pubkey");
                if (sfPk && sfSlug) {
                  router.push(`/shop/${sfSlug}/order-confirmation`);
                } else {
                  router.push("/order-summary");
                }
              }}
              classNames={{
                body: "py-6 bg-white",
                backdrop: "bg-black/50 backdrop-opacity-60",
                header: "border-b-4 border-black bg-white rounded-t-lg",
                footer: "border-t-4 border-black bg-white rounded-b-lg",
                closeButton: "hover:bg-gray-100 active:bg-gray-200",
                base: "border-4 border-black shadow-neo rounded-lg",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-black">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                  <div className="ml-2 font-bold">Order successful!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-black">
                  <div className="flex items-center justify-center font-medium">
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
                body: "py-6 bg-white",
                backdrop: "bg-black/50 backdrop-opacity-60",
                header: "border-b-4 border-black bg-white rounded-t-lg",
                footer: "border-t-4 border-black bg-white rounded-b-lg",
                closeButton: "hover:bg-gray-100 active:bg-gray-200",
                base: "border-4 border-black shadow-neo rounded-lg",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-black">
                  <XCircleIcon className="h-6 w-6 text-red-600" />
                  <div className="ml-2 font-bold">
                    Invoice generation failed!
                  </div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-black">
                  <div className="flex items-center justify-center font-medium">
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
                body: "py-6 bg-white",
                backdrop: "bg-black/50 backdrop-opacity-60",
                header: "border-b-4 border-black bg-white rounded-t-lg",
                footer: "border-t-4 border-black bg-white rounded-b-lg",
                closeButton: "hover:bg-gray-100 active:bg-gray-200",
                base: "border-4 border-black shadow-neo rounded-lg",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-black">
                  <XCircleIcon className="h-6 w-6 text-red-600" />
                  <div className="ml-2 font-bold">Purchase failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-black">
                  <div className="flex items-center justify-center font-medium">
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
                body: "py-6 bg-white",
                backdrop: "bg-black/50 backdrop-opacity-60",
                header: "border-b-4 border-black bg-white rounded-t-lg",
                footer: "border-t-4 border-black bg-white rounded-b-lg",
                closeButton: "hover:bg-gray-100 active:bg-gray-200",
                base: "border-4 border-black shadow-neo rounded-lg",
              }}
              isDismissable={true}
              scrollBehavior={"normal"}
              placement={"center"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex items-center justify-center text-black">
                  <XCircleIcon className="h-6 w-6 text-red-600" />
                  <div className="ml-2 font-bold">Order failed!</div>
                </ModalHeader>
                <ModalBody className="flex flex-col overflow-hidden text-black">
                  <div className="flex items-center justify-center font-medium">
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

  if (sellerPubkey) {
    return (
      <StorefrontThemeWrapper sellerPubkey={sellerPubkey}>
        {listingContent}
      </StorefrontThemeWrapper>
    );
  }

  return listingContent;
};

export default Listing;
