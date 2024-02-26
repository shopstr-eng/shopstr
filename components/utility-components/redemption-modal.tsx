import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, ModalContent, ModalBody, Button } from "@nextui-org/react";
import { useRouter } from "next/router";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

export default function RedemptionModal({
  opened,
  isPaid,
  isCashu,
}: {
  opened: boolean;
  isPaid: boolean;
  isCashu: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setShowModal(opened);
  }, [opened]);

  return isPaid ? (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
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
          <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
            <div className="flex items-center justify-center">
              <CheckCircleIcon className="h-6 w-6 text-green-500" />
              <div>Redeemed</div>
            </div>
            {isCashu ? (
              <div className="flex items-center justify-center">
                Go to https://npub.cash/ to redeem your token with Lightning!
                Any overpaid Lightning fees were donated to Shopstr to support
                development.
              </div>
            ) : (
              <div className="flex items-center justify-center">
                Check your Lightning address for your sats! Any overpaid
                Lightning fees were donated to Shopstr to support development.
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  ) : (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
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
          <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
            <div className="flex items-center justify-center space-x-2">
              <XCircleIcon className="h-6 w-6 text-red-500" />
              <div>Redemption Failed</div>
            </div>
            <div className="items-center justify-center">
              You are redeeming a token of too small/large an amount, no routes
              could be found, or the token is already redeemed. Go to{" "}
              <Link href="https://wallet.nutstash.app/" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Nutstash
                </a>
              </Link>{" "}
              and paste the token string (cashuA...) to try and redeem it!
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
