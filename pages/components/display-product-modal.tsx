import React from "react";
import { BoltIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
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
import ImageCarousel from "./image-carousel";
import { ProfileAvatar } from "./avatar";
import CompactCategories from "./compact-categories";
import { locationAvatar } from "./location-dropdown";
import { DisplayCostBreakdown } from "./display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "./STATIC-VARIABLES";

interface ProductFormProps {
  productData: any;
  handleModalToggle: () => void;
  showModal: boolean;
  handleSendMessage: (pubkeyToOpenChatWith: string) => void;
  handleCheckout: (productId: string) => void;
}

export default function DisplayProductModal({
  productData,
  showModal,
  handleModalToggle,
  handleSendMessage,
  handleCheckout,
}: ProductFormProps) {
  const {
    createdAt,
    title,
    images,
    categories,
    location,
    currency,
    totalCost,
  } = productData;

  const displayDate = (timestamp: number): [string, string] => {
    if (timestamp == 0 || !timestamp) return ["", ""];
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString().split(",")[0].trim();
    const timeString = d.toLocaleString().split(",")[1].trim();
    return [dateString, timeString];
  };

  if (!showModal) return null; // needed to prevent TreeWalker error upon redirect while modal open
  return (
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
          <div className="flex flex-wrap gap-2 justify-between w-full">
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

            <Button
              type="submit"
              onClick={() => handleCheckout(productData.id)}
              className={SHOPSTRBUTTONCLASSNAMES}
              startContent={
                <BoltIcon className="w-6 h-6 hover:text-yellow-500" />
              }
            >
              Checkout: {totalCost} {currency}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
