import React from "react";
import { BoltIcon, EnvelopeIcon, TrashIcon } from "@heroicons/react/24/outline";
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
import ImageCarousel from "./utility-components/image-carousel";
import { ProfileAvatar } from "./utility-components/avatar";
import CompactCategories from "./utility-components/compact-categories";
import { locationAvatar } from "./utility-components/location-dropdown";
import { DisplayCostBreakdown, formatWithCommas } from "./utility-components/display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import RequestPassphraseModal from "./utility-components/request-passphrase-modal";
import ConfirmActionDropdown from "./utility-components/confirm-action-dropdown";
import { getLocalStorageData } from "./utility/nostr-helper-functions";

interface ProductFormProps {
  productData: any;
  handleModalToggle: () => void;
  showModal: boolean;
  handleSendMessage: (pubkeyToOpenChatWith: string) => void;
  handleCheckout: (productId: string) => void;
  handleDelete: (productId: string, passphrase: string) => void;
}

export default function DisplayProductModal({
  productData,
  showModal,
  handleModalToggle,
  handleSendMessage,
  handleCheckout,
  handleDelete,
}: ProductFormProps) {
  const {
    pubkey,
    createdAt,
    title,
    images,
    categories,
    location,
    currency,
    totalCost,
  } = productData;
  const { signIn, decryptedNpub } = getLocalStorageData();

  const [passphrase, setPassphrase] = React.useState("");
  const [requestPassphrase, setRequestPassphrase] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const displayDate = (timestamp: number): [string, string] => {
    if (timestamp == 0 || !timestamp) return ["", ""];
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString().split(",")[0].trim();
    const timeString = d.toLocaleString().split(",")[1].trim();
    return [dateString, timeString];
  };

  const beginDeleteListingProcess = () => {
    if (!signIn) {
      alert("You must be signed in!");
      return;
    }
    if (signIn === "extension") {
      finalizeDeleteListingProcess();
    } else if (signIn === "nsec") {
      setRequestPassphrase(true);
    }
  };
  const finalizeDeleteListingProcess = async () => {
    // only used for when signIn === "nsec"
    setDeleteLoading(true);
    await handleDelete(productData.id, passphrase); // delete listing
    setDeleteLoading(false);
    setRequestPassphrase(false); // close modal
    handleModalToggle(); // closes product detail modal
  };

  if (!showModal) return null; // needed to prevent TreeWalker error upon redirect while modal open

  // Format the totalCost with commas
  const formattedTotalCost = formatWithCommas(totalCost, currency);
  
  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={handleModalToggle}
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          // base: "border-[#292f46] bg-[#19172c] dark:bg-[#19172c] text-[#a8b0d3]",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">{title} </ModalHeader>
          <ModalBody>
            {images ? (
              <ImageCarousel
                images={images}
                showThumbs={images.length > 1}
                classname="max-h-[80vh]"
              />
            ) : null}
            <Divider />
            <div className="w-full h-fit gap-2 flex flex-row justify-between items-center flex-wrap">
              <ProfileAvatar pubkey={productData.pubkey} className="w-1/3" />
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
            <span className="font-semibold text-xl">Summary: </span>
            {productData.summary}
            <Divider />
            <span className="font-semibold text-xl">Price Breakdown: </span>
            <DisplayCostBreakdown monetaryInfo={productData} />
          </ModalBody>

          <ModalFooter>
            <div className="flex flex-wrap gap-2 justify-evenly w-full">
              {decryptedNpub !== pubkey && (
                <Button
                  onClick={() => {
                    handleSendMessage(productData.pubkey);
                  }}
                  type="submit"
                  className={SHOPSTRBUTTONCLASSNAMES}
                  startContent={
                    <EnvelopeIcon className="w-6 h-6 hover:text-yellow-500" />
                  }
                >
                  Message
                </Button>
              )}

              {decryptedNpub == pubkey && (
                <ConfirmActionDropdown
                  helpText="Are you sure you want to delete this listing?"
                  buttonLabel="Delete Listing"
                  onConfirm={beginDeleteListingProcess}
                >
                  <Button
                    color="danger"
                    className="px-20"
                    startContent={
                      <TrashIcon className="w-6 h-6 hover:text-yellow-500" />
                    }
                    isLoading={deleteLoading}
                  >
                    Delete Listing
                  </Button>
                </ConfirmActionDropdown>
              )}
              {decryptedNpub !== pubkey && (
                <Button
                  type="submit"
                  onClick={() => handleCheckout(productData.id)}
                  className={SHOPSTRBUTTONCLASSNAMES}
                  startContent={
                    <BoltIcon className="w-6 h-6 hover:text-yellow-500" />
                  }
                >
                  Checkout: {formattedTotalCost}
                </Button>
              )}
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <RequestPassphraseModal
        passphrase={passphrase}
        onPassphraseChange={setPassphrase}
        isOpen={requestPassphrase}
        setIsOpen={setRequestPassphrase}
        actionOnSubmit={finalizeDeleteListingProcess}
      />
    </>
  );
}
