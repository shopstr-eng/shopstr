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
import { findProductBySlug, getListingSlug, titleToSlug } from "@/utils/url-slugs";
import StorefrontThemeWrapper from "@/components/storefront/storefront-theme-wrapper";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import {
  fetchProductByIdFromDb,
  fetchProductByDTagAndPubkey,
  fetchProductByTitleSlug,
} from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";

type ListingPageProps = {
  ogMeta: OgMetaProps;
  initialProductEvent: NostrEvent | null;
};

function eventToOgMeta(event: NostrEvent, urlPath: string): OgMetaProps {
  const productData = parseTags(event);
  if (productData) {
    return {
      title: productData.title || "Shopstr Listing",
      description: productData.summary || "Check out this product on Shopstr!",
      image: productData.images?.[0] || "/shopstr-2000x2000.png",
      url: urlPath,
    };
  }
  return {
    ...DEFAULT_OG,
    title: "Shopstr Listing",
    description: "Check out this listing on Shopstr!",
    url: urlPath,
  };
}

const LISTING_FALLBACK: OgMetaProps = {
  ...DEFAULT_OG,
  title: "Shopstr Listing",
  description: "Check out this listing on Shopstr!",
};

async function fetchInitialProductEvent(
  identifier: string
): Promise<NostrEvent | null> {
  if (identifier.startsWith("naddr1")) {
    try {
      const decoded = nip19.decode(identifier);
      if (decoded.type === "naddr") {
        return await fetchProductByDTagAndPubkey(
          decoded.data.identifier,
          decoded.data.pubkey
        );
      }
    } catch {}

    return null;
  }

  const eventById = await fetchProductByIdFromDb(identifier);
  if (eventById) return eventById;

  return await fetchProductByTitleSlug(identifier);
}

function getListingStateFromEvent(event: NostrEvent | null) {
  if (!event) {
    return {
      parsedProduct: undefined,
      rawEvent: undefined,
      isZapsnag: false,
    };
  }

  if (event.kind === 1) {
    return {
      parsedProduct: parseZapsnagNote(event),
      rawEvent: event as Event,
      isZapsnag: true,
    };
  }

  return {
    parsedProduct: parseTags(event),
    rawEvent: event as Event,
    isZapsnag: false,
  };
}

function eventMatchesIdentifier(
  event: NostrEvent | null,
  identifier: string
): boolean {
  if (!event || !identifier) return false;
  if (event.id === identifier) return true;

  const dTag = event.tags.find((tag: string[]) => tag[0] === "d")?.[1];
  if (dTag === identifier) return true;

  if (identifier.startsWith("naddr1") && dTag) {
    try {
      return (
        nip19.naddrEncode({
          identifier: dTag,
          pubkey: event.pubkey,
          kind: event.kind,
        }) === identifier
      );
    } catch {
      return false;
    }
  }

  const title = event.tags.find((tag: string[]) => tag[0] === "title")?.[1];
  if (!title) return false;

  const normalizedIdentifier = identifier.toLowerCase();
  const slug = titleToSlug(title).toLowerCase();
  const slugWithPubkeySuffixMatch = identifier.match(/^(.+)-([a-f0-9]{8})$/);
  if (slugWithPubkeySuffixMatch) {
    return (
      slug === slugWithPubkeySuffixMatch[1]!.toLowerCase() &&
      event.pubkey.startsWith(slugWithPubkeySuffixMatch[2]!)
    );
  }

  return slug === normalizedIdentifier;
}

export const getServerSideProps: GetServerSideProps<ListingPageProps> = async (
  context
) => {
  const { productId } = context.query;
  const identifier = Array.isArray(productId) ? productId[0] : productId;

  if (!identifier) {
    return { props: { ogMeta: LISTING_FALLBACK, initialProductEvent: null } };
  }

  const urlPath = `/listing/${identifier}`;

  try {
    const initialProductEvent = await fetchInitialProductEvent(identifier);
    if (initialProductEvent) {
      return {
        props: {
          ogMeta: eventToOgMeta(initialProductEvent, urlPath),
          initialProductEvent,
        },
      };
    }
  } catch (error) {
    console.error("SSR OG fetch error for listing:", error);
  }

  return {
    props: {
      ogMeta: { ...LISTING_FALLBACK, url: urlPath },
      initialProductEvent: null,
    },
  };
};

const Listing = ({ initialProductEvent }: ListingPageProps) => {
  const router = useRouter();
  const initialListingState = getListingStateFromEvent(initialProductEvent);
  const [productData, setProductData] = useState<ProductData | undefined>(
    initialListingState.parsedProduct
  );
  const [isZapsnag, setIsZapsnag] = useState(initialListingState.isZapsnag);
  const [productIdString, setProductIdString] = useState("");
  const [rawEvent, setRawEvent] = useState<Event | undefined>(
    initialListingState.rawEvent
  );
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);
  const [sfSellerPubkey, setSfSellerPubkey] = useState("");

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const productContext = useContext(ProductContext);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const pk =
        sessionStorage.getItem("sf_seller_pubkey") ||
        localStorage.getItem("sf_seller_pubkey");
      if (pk) setSfSellerPubkey(pk);
    }
  }, []);

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
    if (
      initialProductEvent &&
      (!productIdString || eventMatchesIdentifier(initialProductEvent, productIdString))
    ) {
      const initialState = getListingStateFromEvent(initialProductEvent);
      setRawEvent(initialState.rawEvent);
      setIsZapsnag(initialState.isZapsnag);
      setProductData(initialState.parsedProduct);
      return;
    }

    setRawEvent(undefined);
    setIsZapsnag(false);
    setProductData(undefined);
  }, [initialProductEvent, productIdString]);

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
        if (sfSellerPubkey && matchingEvent.pubkey !== sfSellerPubkey) {
          setSfSellerPubkey("");
          sessionStorage.removeItem("sf_seller_pubkey");
          sessionStorage.removeItem("sf_shop_slug");
          localStorage.removeItem("sf_seller_pubkey");
          localStorage.removeItem("sf_shop_slug");
        }
        const nextState = getListingStateFromEvent(matchingEvent);
        setRawEvent(nextState.rawEvent);
        setIsZapsnag(nextState.isZapsnag);
        setProductData(nextState.parsedProduct);

        if (nextState.parsedProduct && matchingEvent.kind !== 1) {
          const canonicalSlug = getListingSlug(nextState.parsedProduct, allParsed);
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
    <StorefrontThemeWrapper sellerPubkey={sfSellerPubkey}>
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

              <RawEventModal
                isOpen={showRawEventModal}
                onClose={() => setShowRawEventModal(false)}
                rawEvent={rawEvent}
              />

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
      </div>
    </StorefrontThemeWrapper>
  );
};

export default Listing;
