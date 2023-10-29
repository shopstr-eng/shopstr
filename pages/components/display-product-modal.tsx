import React, { useMemo, useRef, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  BoltIcon,
  ClipboardIcon,
  TrashIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Input,
  Select,
  SelectItem,
  Chip,
  Divider,
  Image,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";
import ImageCarousel from "./image-carousel";
import { ProfileAvatar } from "./avatar";
import CompactCategories from "./compact-categories";
import { locationAvatar } from "./location-dropdown";
import { DisplayCostBreakdown } from "./display-monetary-info";

interface ProductFormProps {
  productData: any;
  handleModalToggle: () => void;
  showModal: boolean;
}

export default function DisplayProductModal({
  productData,
  showModal,
  handleModalToggle,
}: ProductFormProps) {
  const {
    createdAt,
    title,
    summary,
    publishedAt,
    images,
    categories,
    location,
    price,
    currency,
    shippingType,
    shippingCost,
    totalCost,
  } = productData;
  const displayDate = (timestamp: number): [string, string] => {
    if (timestamp == 0 || !timestamp) return ["", ""];
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString().split(",")[0].trim();
    const timeString = d.toLocaleString().split(",")[1].trim();
    return [dateString, timeString];
  };
  return (
    <Modal
      //   backdrop="blur"
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
              type="submit"
              startContent={
                <EnvelopeIcon
                  className="w-6 h-6 hover:text-yellow-500"
                  // onClick={() => handleSendMessage(pubkey)}
                />
              }
            >
              Message
            </Button>

            <Button
              type="submit"
              startContent={
                <BoltIcon
                  className="w-6 h-6 hover:text-yellow-500"
                  // onClick={() => handleCheckout(eventId, pubkey, totalCost, currency)}
                />
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
