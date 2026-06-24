import { useContext, useState } from "react";
import {
  PencilSquareIcon,
  ShareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
  Divider,
} from "@heroui/react";
import ProductForm from "./product-form";
import ImageCarousel from "./utility-components/image-carousel";
import CompactCategories from "./utility-components/compact-categories";
import { locationAvatar } from "./utility-components/dropdowns/location-dropdown";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";
import ConfirmActionDropdown from "./utility-components/dropdowns/confirm-action-dropdown";
import { ProfileWithDropdown } from "./utility-components/profile/profile-dropdown";
import SuccessModal from "./utility-components/success-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { ProductContext } from "@/utils/context/context";
import { getListingSlug } from "@/utils/url-slugs";
import { NostrEvent } from "@/utils/types/types";

interface ProductModalProps {
  productData: ProductData;
  handleModalToggle: () => void;
  showModal: boolean;
  handleDelete: (productId: string) => void;
}

export default function DisplayProductModal({
  productData,
  showModal,
  handleModalToggle,
  handleDelete,
}: ProductModalProps) {
  const { pubkey: userPubkey, isLoggedIn } = useContext(SignerContext);
  const productEventContext = useContext(ProductContext);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const isExpired = productData.expiration
    ? Date.now() / 1000 > productData.expiration
    : false;

  const displayDate = (timestamp: number): [string, string] => {
    if (timestamp == 0 || !timestamp) return ["", ""];
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString().split(",")[0]!.trim();
    const timeString = d.toLocaleString().split(",")[1]!.trim();
    return [dateString, timeString];
  };

  const handleShare = async () => {
    const allParsed = productEventContext.productEvents
      .filter((event: NostrEvent) => event.kind !== 1)
      .map((event: NostrEvent) => parseTags(event))
      .filter(
        (parsed: ProductData | undefined): parsed is ProductData => !!parsed
      );

    if (!allParsed.some((parsed) => parsed.id === productData.id)) {
      allParsed.push(productData);
    }

    const listingPath =
      getListingSlug(productData, allParsed) || productData.id;
    const shareData = {
      title: productData.title,
      url: `${window.location.origin}/listing/${listingPath}`,
    };
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      navigator.clipboard.writeText(
        `${window.location.origin}/listing/${listingPath}`
      );
      setShowSuccessModal(true);
    }
  };

  const handleEditToggle = () => {
    setShowProductForm(!showProductForm);
  };

  const beginDeleteListingProcess = () => {
    if (!isLoggedIn) return;
    finalizeDeleteListingProcess();
  };
  const finalizeDeleteListingProcess = () => {
    // only used for when signInMethod === "nsec"
    setDeleteLoading(true);
    handleModalToggle(); // closes product detail modal
    handleDelete(productData.id); // delete listing
    setDeleteLoading(false);
  };

  if (!showModal) return null; // needed to prevent TreeWalker error upon redirect while modal open

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={handleModalToggle}
        classNames={{
          base: "border border-zinc-800 bg-[#161616] shadow-xl",
          body: "py-6",
          backdrop: "bg-black/80 backdrop-blur-sm",
          header: "border-b border-zinc-800 py-4",
          footer: "border-t border-zinc-800 py-4",
          closeButton: "text-zinc-400 hover:bg-white/10 active:bg-white/20",
        }}
        isDismissable={false}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col text-white">
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
              <h2 className="text-xl font-black tracking-tighter text-white uppercase md:text-2xl">
                {productData.title}
                {isExpired && (
                  <Chip
                    color="warning"
                    variant="flat"
                    className="ml-2"
                    size="sm"
                  >
                    Outdated
                  </Chip>
                )}
              </h2>
              <div className="flex items-center gap-3">
                {productData.expiration && (
                  <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
                    Expires:{" "}
                    {new Date(
                      productData.expiration * 1000
                    ).toLocaleDateString()}
                  </p>
                )}
                {productData.status === "active" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 bg-green-400/10 px-2 py-0.5 text-xs font-medium text-green-300 text-green-700">
                    Active
                  </span>
                )}
                {productData.status === "sold" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 bg-red-400/10 px-2 py-0.5 text-xs font-medium text-red-300 text-red-700">
                    Sold
                  </span>
                )}
              </div>
            </div>
          </ModalHeader>
          <ModalBody className="text-white">
            {productData.images ? (
              <ImageCarousel
                images={productData.images}
                showThumbs={productData.images.length > 1}
                classname="max-h-[50vh] md:max-h-[80vh]"
              />
            ) : null}
            <Divider />
            <div className="flex h-fit w-full flex-row flex-wrap items-center justify-between gap-2">
              <ProfileWithDropdown
                pubkey={productData.pubkey}
                dropDownKeys={
                  productData.pubkey === userPubkey
                    ? ["shop_profile"]
                    : ["shop", "inquiry", "copy_npub"]
                }
              />
              <Chip
                key={productData.location}
                startContent={locationAvatar(productData.location)}
              >
                {productData.location}
              </Chip>
              <CompactCategories categories={productData.categories} />
              <div>
                <p className="text-md">
                  {displayDate(productData.createdAt)[0]}
                </p>
                <p className="text-md">
                  {displayDate(productData.createdAt)[1]}
                </p>
              </div>
            </div>
            <Divider />
            <span className="text-xl font-semibold">Summary: </span>
            <span className="break-words whitespace-pre-wrap">
              {productData.summary}
            </span>
            {productData.sizes && productData.sizes.length > 0 ? (
              <>
                <span className="text-xl font-semibold">Sizes: </span>
                <div className="flex flex-wrap items-center">
                  {productData.sizes && productData.sizes.length > 0
                    ? productData.sizes.map((size: string) => (
                        <span key={size} className="mr-4 mb-2 text-white">
                          {size}: {productData.sizeQuantities?.get(size) || 0}
                        </span>
                      ))
                    : null}
                </div>
              </>
            ) : null}
            {productData.volumes && productData.volumes.length > 0 ? (
              <>
                <span className="text-xl font-semibold">Volumes: </span>
                <div className="flex flex-wrap items-center">
                  {productData.volumes && productData.volumes.length > 0
                    ? productData.volumes.map((volume: string) => (
                        <span key={volume} className="mr-4 mb-2 text-white">
                          {volume}: {productData.volumePrices?.get(volume) || 0}{" "}
                          {productData.currency}
                        </span>
                      ))
                    : null}
                </div>
              </>
            ) : null}
            {productData.weights && productData.weights.length > 0 ? (
              <>
                <span className="text-xl font-semibold">Weights: </span>
                <div className="flex flex-wrap items-center">
                  {productData.weights && productData.weights.length > 0
                    ? productData.weights.map((weight: string) => (
                        <span key={weight} className="mr-4 mb-2 text-white">
                          {weight}: {productData.weightPrices?.get(weight) || 0}{" "}
                          {productData.currency}
                        </span>
                      ))
                    : null}
                </div>
              </>
            ) : null}
            {productData.bulkPrices && productData.bulkPrices.size > 0 ? (
              <>
                <span className="text-xl font-semibold">Bulk Pricing: </span>
                <div className="flex flex-wrap items-center">
                  {Array.from(productData.bulkPrices.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([units, price]) => (
                      <span key={units} className="mr-4 mb-2 text-white">
                        {units} units: {price} {productData.currency}
                      </span>
                    ))}
                </div>
              </>
            ) : null}
            {productData.condition && (
              <>
                <div className="text-left text-xs text-white">
                  <span className="text-xl font-semibold">Condition: </span>
                  <span className="text-xl">{productData.condition}</span>
                </div>
              </>
            )}
            {productData.quantity && (
              <>
                <div className="text-left text-xs text-white">
                  <span className="text-xl font-semibold">Quantity: </span>
                  <span className="text-xl">{productData.quantity}</span>
                </div>
              </>
            )}
            {productData.restrictions && (
              <>
                <div className="text-left text-xs text-white">
                  <span className="text-xl font-semibold">Restrictions: </span>
                  <span className="text-xl text-red-500">
                    {productData.restrictions}
                  </span>
                </div>
              </>
            )}
            {productData.required && (
              <>
                <div className="text-left text-xs text-white">
                  <span className="text-xl font-semibold">
                    Required Customer Information:{" "}
                  </span>
                  <span className="text-xl">{productData.required}</span>
                </div>
              </>
            )}
          </ModalBody>

          <ModalFooter>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Button
                type="submit"
                className={`${NEO_BTN} w-full`}
                startContent={
                  <ShareIcon className="h-6 w-6 hover:text-yellow-500" />
                }
                onClick={() => {
                  handleShare().catch((e) => console.error(e));
                }}
              >
                Share
              </Button>
              {userPubkey === productData.pubkey && (
                <>
                  <Button
                    type="submit"
                    className={`${NEO_BTN} w-full`}
                    startContent={
                      <PencilSquareIcon className="h-6 w-6 hover:text-yellow-500" />
                    }
                    onClick={handleEditToggle}
                    isDisabled={deleteLoading}
                  >
                    Edit Listing
                  </Button>
                  <ConfirmActionDropdown
                    helpText="Are you sure you want to delete this listing?"
                    buttonLabel="Delete Listing"
                    onConfirm={beginDeleteListingProcess}
                  >
                    <Button
                      className={`${NEO_BTN} w-full bg-red-500 text-white hover:bg-red-400`}
                      startContent={
                        <TrashIcon className="h-6 w-6 hover:text-yellow-500" />
                      }
                      isDisabled={deleteLoading}
                      isLoading={deleteLoading}
                    >
                      Delete Listing
                    </Button>
                  </ConfirmActionDropdown>
                </>
              )}
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {userPubkey === productData.pubkey && (
        <ProductForm
          showModal={showProductForm}
          handleModalToggle={handleEditToggle}
          oldValues={productData}
          handleDelete={handleDelete}
          onSubmitCallback={handleModalToggle}
        />
      )}
      <SuccessModal
        bodyText="Listing URL copied to clipboard!"
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
      />
    </>
  );
}
