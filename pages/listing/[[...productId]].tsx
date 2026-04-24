import { useState, useEffect, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
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
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { parseZapsnagNote } from "@/utils/parsers/zapsnag-parser";
import CheckoutCard from "../../components/utility-components/checkout-card";
import ZapsnagButton from "../../components/ZapsnagButton";
import { ProductContext, ShopMapContext } from "../../utils/context/context";
import { nip19 } from "nostr-tools";
import {
  RawEventModal,
  EventIdModal,
} from "../../components/utility-components/modals/event-modals";
import { findProductBySlug, getListingSlug } from "@/utils/url-slugs";
import StorefrontThemeWrapper from "@/components/storefront/storefront-theme-wrapper";
import ProductPageRenderer from "@/components/storefront/product-page-renderer";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import {
  fetchProductByIdFromDb,
  fetchProductByDTagAndPubkey,
  fetchProductByListingSlug,
} from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

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
    const cfg = productData.pageConfig;
    const galleryImage = cfg?.sections?.find(
      (s) => s.type === "product_gallery" && s.galleryImages?.length
    )?.galleryImages?.[0];
    return {
      title: cfg?.metaTitle || productData.title || "Milk Market Listing",
      description:
        cfg?.metaDescription ||
        productData.summary ||
        "Check out this product on Milk Market!",
      image:
        cfg?.ogImage ||
        productData.images?.[0] ||
        galleryImage ||
        "/milk-market.png",
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

function buildProductJsonLd(
  product: ProductData,
  shopName?: string
): Record<string, unknown> | null {
  if (!product?.title) return null;
  const cfg = product.pageConfig;
  const galleryImages =
    cfg?.sections?.find(
      (s) => s.type === "product_gallery" && s.galleryImages?.length
    )?.galleryImages || [];
  const images = [...(product.images || []), ...galleryImages].filter(Boolean);
  const description = cfg?.metaDescription || product.summary || product.title;
  const availability =
    product.status && product.status !== "active"
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";
  const price =
    product.totalCost && product.totalCost > 0
      ? product.totalCost
      : product.price;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: cfg?.metaTitle || product.title,
    description,
  };
  if (images.length > 0) ld.image = images;
  if (product.d) ld.sku = product.d;
  if (shopName) {
    ld.brand = { "@type": "Brand", name: shopName };
  }
  if (price && product.currency) {
    ld.offers = {
      "@type": "Offer",
      priceCurrency: product.currency,
      price: String(price),
      availability,
    };
  }
  return ld;
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

  const [fiatOrderIsPlaced, setFiatOrderIsPlaced] = useState(false);
  const [fiatOrderFailed, setFiatOrderFailed] = useState(false);
  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  // Once payment lands, let the inline confirmation render briefly and then
  // push straight to the order summary (or storefront confirmation if the
  // listing was opened from a custom storefront). Avoids the prior friction
  // of a "click X to dismiss" success modal.
  useEffect(() => {
    if (!fiatOrderIsPlaced && !invoiceIsPaid && !cashuPaymentSent) return;
    const timer = setTimeout(() => {
      setFiatOrderIsPlaced(false);
      setInvoiceIsPaid(false);
      setCashuPaymentSent(false);
      const sfSlug =
        typeof window !== "undefined"
          ? sessionStorage.getItem("sf_shop_slug")
          : null;
      const sfPk =
        typeof window !== "undefined"
          ? sessionStorage.getItem("sf_seller_pubkey")
          : null;
      if (sfPk && sfSlug) {
        router.push(`/stall/${sfSlug}/order-confirmation`);
      } else {
        router.push("/order-summary");
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [fiatOrderIsPlaced, invoiceIsPaid, cashuPaymentSent, router]);

  const productContext = useContext(ProductContext);
  const shopMapContext = useContext(ShopMapContext);

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

  const sellerPubkey = productData?.pubkey || "";

  const productJsonLd = useMemo(() => {
    if (!productData || isZapsnag) return null;
    const shopName = shopMapContext?.shopData?.get(sellerPubkey)?.content?.name;
    return buildProductJsonLd(productData, shopName);
  }, [productData, isZapsnag, shopMapContext?.shopData, sellerPubkey]);

  const listingContent = (
    <>
      {productJsonLd && (
        <Head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(productJsonLd),
            }}
          />
        </Head>
      )}
      <div className="flex h-full min-h-screen flex-col bg-white pt-20">
        {productData ? (
          isZapsnag ? (
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
            <>
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
              <ProductPageRenderer
                product={productData}
                sellerPubkey={sellerPubkey}
              />
            </>
          )
        ) : isListingNotFound ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
            <div className="shadow-neo w-full max-w-2xl rounded-md border-2 border-black bg-white px-8 pt-8 pb-8 text-center">
              <h1 className="mb-2 text-5xl font-bold text-black">404</h1>
              <h2 className="mb-6 text-2xl font-medium text-black md:text-3xl">
                Listing Not Found
              </h2>
              <p className="mb-8 text-black">
                This listing doesn&apos;t exist, hasn&apos;t synced yet, or is
                no longer available from your current data sources.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button
                  className={BLUEBUTTONCLASSNAMES}
                  onPress={() => router.back()}
                >
                  Go back
                </Button>
                <Button
                  className={BLUEBUTTONCLASSNAMES}
                  onPress={() => router.push("/marketplace")}
                >
                  View marketplace
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center">
            <MilkMarketSpinner />
          </div>
        )}
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
