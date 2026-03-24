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
} from "@nextui-org/react";
import ProductForm from "./product-form";
import ImageCarousel from "./utility-components/image-carousel";
import CompactCategories from "./utility-components/compact-categories";
import { locationAvatar } from "./utility-components/dropdowns/location-dropdown";
// Import the new DANGERBUTTONCLASSNAMES
import {
  WHITEBUTTONCLASSNAMES,
  DANGERBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import ConfirmActionDropdown from "./utility-components/dropdowns/confirm-action-dropdown";
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
  handleDelete: (productId: string) => Promise<void>;
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
      .filter((e: NostrEvent) => e.kind !== 1)
      .map((e: NostrEvent) => parseTags(e))
      .filter((p: ProductData | undefined): p is ProductData => !!p);

    const slug = getListingSlug(productData, allParsed);
    const listingPath = slug || productData.id;
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
  const finalizeDeleteListingProcess = async () => {
    // only used for when signInMethod === "nsec"
    setDeleteLoading(true);
    await handleDelete(productData.id); // delete listing
    setDeleteLoading(false);
    handleModalToggle(); // closes product detail modal
  };

  if (!showModal) return null; // needed to prevent TreeWalker error upon redirect while modal open

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={handleModalToggle}
        classNames={{
          // Updated modal styles
          wrapper: "shadow-neo", // Apply shadow to the modal wrapper
          base: "border-2 border-black rounded-md",
          body: "py-6 bg-white",
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          footer: "border-t-2 border-black bg-white rounded-b-md",
          closeButton:
            "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
        }}
        isDismissable={false}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          {/* Updated text color */}
          <ModalHeader className="flex flex-col text-black">
            <div className="flex items-center justify-between">
              {/* Updated text color */}
              <h2 className="text-2xl font-bold text-black">
                {productData.title}
                {isExpired && (
                  <Chip color="warning" variant="flat" className="ml-2">
                    Outdated
                  </Chip>
                )}
              </h2>
              {productData.expiration && (
                <p className="text-sm text-gray-500">
                  Valid until:{" "}
                  {new Date(productData.expiration * 1000).toLocaleDateString()}
                </p>
              )}
              <div>
                {/* Updated "Active" chip styles */}
                {productData.status === "active" && (
                  <span className="inline-flex items-center gap-1 rounded-md border-2 border-black bg-green-400 px-2 py-0.5 text-xs font-bold text-black">
                    Active
                  </span>
                )}
                {/* Updated "Sold" chip styles */}
                {productData.status === "sold" && (
                  <span className="inline-flex items-center gap-1 rounded-md border-2 border-black bg-red-400 px-2 py-0.5 text-xs font-bold text-black">
                    Sold
                  </span>
                )}
              </div>
            </div>
          </ModalHeader>
          {/* Updated text color */}
          <ModalBody className="text-black">
            {productData.images ? (
              <ImageCarousel
                images={productData.images}
                showThumbs={productData.images.length > 1}
                classname="max-h-[80vh]"
              />
            ) : null}
            {/* Updated Divider style */}
            <Divider className="h-0.5 bg-black" />
            <div className="flex h-fit w-full flex-row flex-wrap items-center justify-between gap-2">
              {/* Updated Chip style */}
              <Chip
                key={productData.location}
                startContent={locationAvatar(productData.location)}
                classNames={{
                  base: "bg-white border-2 border-black text-black rounded-md",
                }}
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
            {/* Updated Divider style */}
            <Divider className="h-0.5 bg-black" />
            <span className="text-xl font-semibold">Summary: </span>
            <span className="whitespace-break-spaces break-all">
              {productData.summary}
            </span>
            {productData.sizes && productData.sizes.length > 0 ? (
              <>
                <span className="text-xl font-semibold">Sizes: </span>
                <div className="flex flex-wrap items-center">
                  {productData.sizes && productData.sizes.length > 0
                    ? productData.sizes.map((size: string) => (
                        // Updated text color
                        <span key={size} className="mb-2 mr-4 text-black">
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
                        // Updated text color
                        <span key={volume} className="mb-2 mr-4 text-black">
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
                        // Updated text color
                        <span key={weight} className="mb-2 mr-4 text-black">
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
                      <span key={units} className="mb-2 mr-4 text-black">
                        {units} units: {price} {productData.currency}
                      </span>
                    ))}
                </div>
              </>
            ) : null}
            {productData.condition && (
              <>
                {/* Updated text color */}
                <div className="text-left text-xs text-black">
                  <span className="text-xl font-semibold">Condition: </span>
                  <span className="text-xl">{productData.condition}</span>
                </div>
              </>
            )}
            {productData.quantity && (
              <>
                {/* Updated text color */}
                <div className="text-left text-xs text-black">
                  <span className="text-xl font-semibold">Quantity: </span>
                  <span className="text-xl">{productData.quantity}</span>
                </div>
              </>
            )}
            {productData.restrictions && (
              <>
                {/* Updated text color */}
                <div className="text-left text-xs text-black">
                  <span className="text-xl font-semibold">Restrictions: </span>
                  <span className="text-xl text-red-500">
                    {productData.restrictions}
                  </span>
                </div>
              </>
            )}
            {productData.required && (
              <>
                {/* Updated text color */}
                <div className="text-left text-xs text-black">
                  <span className="text-xl font-semibold">
                    Required Customer Information:{" "}
                  </span>
                  <span className="text-xl">{productData.required}</span>
                </div>
              </>
            )}
          </ModalBody>

          <ModalFooter>
            <div className="flex w-full flex-wrap justify-evenly gap-2">
              <Button
                type="submit"
                className={WHITEBUTTONCLASSNAMES}
                startContent={
                  // Updated icon hover color
                  <ShareIcon className="h-6 w-6 hover:text-primary-yellow" />
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
                    className={WHITEBUTTONCLASSNAMES}
                    startContent={
                      // Updated icon hover color
                      <PencilSquareIcon className="h-6 w-6 hover:text-primary-yellow" />
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
                      // Updated "Delete" button class
                      className={DANGERBUTTONCLASSNAMES}
                      startContent={
                        // Updated icon hover color
                        <TrashIcon className="h-6 w-6 hover:text-primary-yellow" />
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
