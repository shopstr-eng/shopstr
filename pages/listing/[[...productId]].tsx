import { useState, useEffect, useContext, useMemo } from "react";
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
} from "@heroui/react";
import { XCircleIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { parseZapsnagNote } from "@/utils/parsers/zapsnag-parser";
import CheckoutCard from "../../components/utility-components/checkout-card";
import ZapsnagButton from "../../components/ZapsnagButton";
import { ProductContext } from "../../utils/context/context";
import { nip19 } from "nostr-tools";
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
  fetchProductByListingSlug,
} from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

type ListingPageProps = {
  ogMeta: OgMetaProps;
  initialProductEvent: NostrEvent | null;
};

type ResolvedListingState = {
  productData: ProductData;
  rawEvent: NostrEvent;
  isZapsnag: boolean;
};

function getListingIdentifier(
  productId: string | string[] | undefined
): string {
  return Array.isArray(productId) ? productId[0] || "" : productId || "";
}

function resolveListingStateFromEvent(
  event: NostrEvent | null | undefined
): ResolvedListingState | undefined {
  if (!event) {
    return;
  }

  if (event.kind === 1) {
    const productData = parseZapsnagNote(event);
    if (!productData) {
      return;
    }

    return {
      productData,
      rawEvent: event,
      isZapsnag: true,
    };
  }

  const productData = parseTags(event);
  if (!productData) {
    return;
  }

  return {
    productData,
    rawEvent: event,
    isZapsnag: false,
  };
}

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

export const getServerSideProps: GetServerSideProps<ListingPageProps> = async (
  context
) => {
  const { productId } = context.query;
  const identifier = getListingIdentifier(productId);

  if (!identifier) {
    return { props: { ogMeta: LISTING_FALLBACK, initialProductEvent: null } };
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
          if (event) {
            return {
              props: {
                ogMeta: eventToOgMeta(event, urlPath),
                initialProductEvent: event,
              },
            };
          }
        }
      } catch {}
      return {
        props: {
          ogMeta: { ...LISTING_FALLBACK, url: urlPath },
          initialProductEvent: null,
        },
      };
    }

    const eventById = await fetchProductByIdFromDb(identifier);
    if (eventById) {
      return {
        props: {
          ogMeta: eventToOgMeta(eventById, urlPath),
          initialProductEvent: eventById,
        },
      };
    }

    const eventBySlug = await fetchProductByListingSlug(identifier);
    if (eventBySlug) {
      return {
        props: {
          ogMeta: eventToOgMeta(eventBySlug, urlPath),
          initialProductEvent: eventBySlug,
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
  const seededListing = useMemo(
    () => resolveListingStateFromEvent(initialProductEvent),
    [initialProductEvent]
  );
  const [productData, setProductData] = useState<ProductData | undefined>(
    seededListing?.productData
  );
  const [isZapsnag, setIsZapsnag] = useState(seededListing?.isZapsnag ?? false);
  const [productIdString, setProductIdString] = useState("");
  const [rawEvent, setRawEvent] = useState<NostrEvent | undefined>(
    seededListing?.rawEvent
  );
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);
  const [sfSellerPubkey, setSfSellerPubkey] = useState("");
  const [isListingNotFound, setIsListingNotFound] = useState(false);

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  // Once payment lands, let the inline "Payment confirmed!" GIF play through
  // once and then push straight to the order summary page. Avoids the prior
  // friction of a "click X to dismiss" success modal.
  useEffect(() => {
    if (!invoiceIsPaid && !cashuPaymentSent) return;
    const timer = setTimeout(() => {
      setInvoiceIsPaid(false);
      setCashuPaymentSent(false);
      router.push("/order-summary");
    }, 2500);
    return () => clearTimeout(timer);
  }, [invoiceIsPaid, cashuPaymentSent, router]);

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
      const resolvedProductId = Array.isArray(productId)
        ? productId[0] || ""
        : productId || "";
      setProductIdString(resolvedProductId);
      if (!resolvedProductId) {
        router.push("/marketplace");
      }
    }
  }, [router, router.isReady, router.query.productId]);

  useEffect(() => {
    if (seededListing) {
      setProductData(seededListing.productData);
      setRawEvent(seededListing.rawEvent);
      setIsZapsnag(seededListing.isZapsnag);
    } else {
      setProductData(undefined);
      setRawEvent(undefined);
      setIsZapsnag(false);
    }
    setIsListingNotFound(false);
  }, [seededListing]);

  useEffect(() => {
    if (!router.isReady || !productIdString) {
      return;
    }

    if (productContext.isLoading || !productContext.productEvents) {
      setIsListingNotFound(false);
      return;
    }

    if (!productContext.isLoading && productContext.productEvents) {
      const allParsed = productContext.productEvents
        .filter((e: NostrEvent) => e.kind !== 1)
        .map((e: NostrEvent) => parseTags(e))
        .filter((p: ProductData | undefined): p is ProductData => !!p);

      let matchingEvent: NostrEvent | undefined;

      const slugMatch = findProductBySlug(productIdString, allParsed);
      if (slugMatch) {
        matchingEvent = productContext.productEvents.find(
          (e: NostrEvent) => e.id === slugMatch.id
        );
      }

      if (!matchingEvent) {
        matchingEvent = productContext.productEvents.find(
          (event: NostrEvent) => {
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
          }
        );
      }

      if (matchingEvent) {
        if (sfSellerPubkey && matchingEvent.pubkey !== sfSellerPubkey) {
          setSfSellerPubkey("");
          sessionStorage.removeItem("sf_seller_pubkey");
          sessionStorage.removeItem("sf_shop_slug");
          localStorage.removeItem("sf_seller_pubkey");
          localStorage.removeItem("sf_shop_slug");
        }
        const resolvedListing = resolveListingStateFromEvent(matchingEvent);
        if (resolvedListing) {
          setRawEvent(resolvedListing.rawEvent);
          setProductData(resolvedListing.productData);
          setIsZapsnag(resolvedListing.isZapsnag);
          setIsListingNotFound(false);
          return;
        }

        setRawEvent(matchingEvent);
        setProductData(undefined);
        setIsZapsnag(false);
        setIsListingNotFound(!seededListing);
      } else if (!seededListing && productContext.productEvents.length > 0) {
        setRawEvent(undefined);
        setProductData(undefined);
        setIsZapsnag(false);
        setIsListingNotFound(true);
      }
    }
  }, [
    productContext.isLoading,
    productContext.productEvents,
    productIdString,
    router,
    router.isReady,
    seededListing,
    sfSellerPubkey,
  ]);

  useEffect(() => {
    if (
      !router.isReady ||
      !productIdString ||
      !productData ||
      isZapsnag ||
      productContext.isLoading
    ) {
      return;
    }

    const allParsed = productContext.productEvents
      .filter((event: NostrEvent) => event.kind !== 1)
      .map((event: NostrEvent) => parseTags(event))
      .filter(
        (parsed: ProductData | undefined): parsed is ProductData => !!parsed
      );

    if (
      rawEvent &&
      rawEvent.kind !== 1 &&
      !allParsed.some((parsed: ProductData) => parsed.id === rawEvent.id)
    ) {
      const parsedRawEvent = parseTags(rawEvent);
      if (parsedRawEvent) {
        allParsed.push(parsedRawEvent);
      }
    }

    const canonicalSlug = getListingSlug(productData, allParsed);
    if (canonicalSlug && productIdString !== canonicalSlug) {
      router.replace(`/listing/${canonicalSlug}`, undefined, {
        shallow: true,
      });
    }
  }, [
    productContext.isLoading,
    productContext.productEvents,
    productData,
    productIdString,
    rawEvent,
    router,
    router.isReady,
    isZapsnag,
  ]);

  return (
    <StorefrontThemeWrapper sellerPubkey={sfSellerPubkey}>
      <div className="bg-light-bg dark:bg-dark-bg flex h-full min-h-screen flex-col pt-20">
        {productData ? (
          isZapsnag ? (
            <div className="mx-auto w-full max-w-2xl p-6">
              <div className="overflow-hidden rounded-xl bg-white shadow-lg dark:bg-neutral-900">
                <img
                  src={productData.images[0]}
                  className="h-96 w-full object-cover"
                />
                <div className="p-6">
                  <div className="mb-2 flex items-start justify-between">
                    <h1 className="text-light-text dark:text-dark-text text-2xl font-bold">
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
              key={productData.id}
              productData={productData}
              setInvoiceIsPaid={setInvoiceIsPaid}
              setInvoiceGenerationFailed={setInvoiceGenerationFailed}
              setCashuPaymentSent={setCashuPaymentSent}
              setCashuPaymentFailed={setCashuPaymentFailed}
              rawEvent={rawEvent}
            />
          )
        ) : isListingNotFound ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
            <h1 className="text-light-text dark:text-dark-text text-3xl font-bold">
              Listing Not Found
            </h1>
            <p className="mt-4 max-w-lg text-gray-500 dark:text-gray-400">
              This listing doesn&apos;t exist, hasn&apos;t synced yet, or is no
              longer available from your current data sources.
            </p>
            <Button
              className="mt-6"
              color="secondary"
              onPress={() => router.push("/marketplace")}
            >
              View marketplace
            </Button>
          </div>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center">
            <ShopstrSpinner />
          </div>
        )}
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
                <ModalHeader className="text-light-text dark:text-dark-text flex items-center justify-center">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Invoice generation failed!</div>
                </ModalHeader>
                <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
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
                <ModalHeader className="text-light-text dark:text-dark-text flex items-center justify-center">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Purchase failed!</div>
                </ModalHeader>
                <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
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
