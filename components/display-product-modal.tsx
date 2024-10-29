import React, { useState } from "react";
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
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import RequestPassphraseModal from "./utility-components/request-passphrase-modal";
import ConfirmActionDropdown from "./utility-components/dropdowns/confirm-action-dropdown";
import { getLocalStorageData } from "./utility/nostr-helper-functions";
import { ProfileWithDropdown } from "./utility-components/profile/profile-dropdown";
import SuccessModal from "./utility-components/success-modal";

interface ProductModalProps {
  productData: any;
  handleModalToggle: () => void;
  showModal: boolean;
  handleDelete: (productId: string, passphrase?: string) => void;
}

export default function DisplayProductModal({
  productData,
  showModal,
  handleModalToggle,
  handleDelete,
}: ProductModalProps) {
  const {
    pubkey,
    createdAt,
    title,
    images,
    categories,
    location,
    sizes,
    sizeQuantities,
    condition,
    status,
    quantity,
  } = productData;
  const { signInMethod, userPubkey } = getLocalStorageData();

  const [requestPassphrase, setRequestPassphrase] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const displayDate = (timestamp: number): [string, string] => {
    if (timestamp == 0 || !timestamp) return ["", ""];
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString().split(",")[0].trim();
    const timeString = d.toLocaleString().split(",")[1].trim();
    return [dateString, timeString];
  };

  const handleShare = async () => {
    // The content you want to share
    const shareData = {
      title: title,
      url: `${window.location.origin}/listing/${productData.id}`,
    };
    // Check if the Web Share API is available
    if (navigator.share) {
      // Use the share API
      await navigator.share(shareData);
    } else {
      // Fallback for browsers that do not support the Web Share API
      navigator.clipboard.writeText(
        `${window.location.origin}/listing/${productData.id}`,
      );
      setShowSuccessModal(true);
    }
  };

  const handleEditToggle = () => {
    setShowProductForm(!showProductForm);
  };

  const beginDeleteListingProcess = () => {
    if (signInMethod === "extension") {
      finalizeDeleteListingProcess();
    } else if (signInMethod === "nsec") {
      setRequestPassphrase(true);
    }
  };
  const finalizeDeleteListingProcess = async (passphrase?: string) => {
    // only used for when signInMethod === "nsec"
    setDeleteLoading(true);
    handleModalToggle(); // closes product detail modal
    handleDelete(productData.id, passphrase); // delete listing
    setDeleteLoading(false);
  };

  if (!showModal) return null; // needed to prevent TreeWalker error upon redirect while modal open

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={handleModalToggle}
        // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        isDismissable={false}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col text-light-text dark:text-dark-text">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
                {title}
              </h2>
              <div>
                {status === "active" && (
                  <span className="mr-2 rounded-full bg-green-500 px-2 py-1 text-xs font-semibold text-white">
                    Active
                  </span>
                )}
                {status === "sold" && (
                  <span className="mr-2 rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white">
                    Sold
                  </span>
                )}
              </div>
            </div>
          </ModalHeader>
          <ModalBody className="text-light-text dark:text-dark-text">
            {images ? (
              <ImageCarousel
                images={images}
                showThumbs={images.length > 1}
                classname="max-h-[80vh]"
              />
            ) : null}
            <Divider />
            <div className="flex h-fit w-full flex-row flex-wrap items-center justify-between gap-2">
              <ProfileWithDropdown
                pubkey={productData.pubkey}
                dropDownKeys={
                  productData.pubkey === userPubkey
                    ? ["shop_settings"]
                    : ["shop", "message"]
                }
              />
              <Chip key={location} startContent={locationAvatar(location)}>
                {location}
              </Chip>
              <CompactCategories categories={categories} />
              <div>
                <p className="text-md">{displayDate(createdAt)[0]}</p>
                <p className="text-md">{displayDate(createdAt)[1]}</p>
              </div>
            </div>
            <Divider />
            <span className="text-xl font-semibold">Summary: </span>
            <span className="whitespace-break-spaces break-all">
              {productData.summary}
            </span>
            {sizes && sizes.length > 0 ? (
              <>
                <span className="text-xl font-semibold">Sizes: </span>
                <div className="flex flex-wrap items-center">
                  {sizes && sizes.length > 0
                    ? sizes.map((size: string) => (
                        <span
                          key={size}
                          className="mb-2 mr-4 text-light-text dark:text-dark-text"
                        >
                          {size}: {sizeQuantities?.get(size) || 0}
                        </span>
                      ))
                    : null}
                </div>
              </>
            ) : null}
            {condition && (
              <>
                <div className="text-left text-xs text-light-text dark:text-dark-text">
                  <span className="text-xl font-semibold">Condition: </span>
                  <span className="text-xl">{condition}</span>
                </div>
              </>
            )}
            {quantity && (
              <>
                <div className="text-left text-xs text-light-text dark:text-dark-text">
                  <span className="text-xl font-semibold">Quantity: </span>
                  <span className="text-xl">{quantity}</span>
                </div>
              </>
            )}
          </ModalBody>

          <ModalFooter>
            <div className="flex w-full flex-wrap justify-evenly gap-2">
              <Button
                type="submit"
                className={SHOPSTRBUTTONCLASSNAMES}
                startContent={
                  <ShareIcon className="h-6 w-6 hover:text-yellow-500" />
                }
                onClick={handleShare}
              >
                Share
              </Button>
              {userPubkey === pubkey && (
                <>
                  <Button
                    type="submit"
                    className={SHOPSTRBUTTONCLASSNAMES}
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
                      className="min-w-fit bg-gradient-to-tr from-red-600 via-red-500 to-red-600 text-white shadow-lg"
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
      <RequestPassphraseModal
        isOpen={requestPassphrase}
        setIsOpen={setRequestPassphrase}
        actionOnSubmit={finalizeDeleteListingProcess}
      />
      {userPubkey === pubkey && (
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
