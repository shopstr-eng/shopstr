import React, { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Modal, ModalContent, ModalBody, Button } from "@nextui-org/react";
import { useRouter } from "next/router";
import {
  CheckCircleIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { nip19 } from "nostr-tools";
import { getEncodedToken } from "@cashu/cashu-ts";
import { formatWithCommas } from "./display-monetary-info";

export default function RedemptionModal({
  opened,
  isPaid,
  isCashu,
  changeAmount,
  changeProofs,
  lnurl,
}: {
  opened: boolean;
  isPaid: boolean;
  isCashu: boolean;
  changeAmount: number;
  changeProofs: any[];
  lnurl: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const { npub, decryptedNpub, mints, relays } = getLocalStorageData();

  const [formattedChangeAmount, setFormattedChangeAmount] = useState("");

  const [randomNpub, setRandomNpub] = useState<string>("");
  const [randomNsec, setRandomNsec] = useState<string>("");

  const router = useRouter();

  useEffect(() => {
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setRandomNpub(response.data.npub);
        setRandomNsec(response.data.nsec);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    setFormattedChangeAmount(formatWithCommas(changeAmount, "sats"));
  }, [changeAmount]);

  useEffect(() => {
    setShowModal(opened);
  }, [opened]);

  const sendChange = async (pubkey: string) => {
    if (changeAmount >= 1) {
      const decryptedRandomNpub = nip19.decode(randomNpub);
      const decryptedRandomNsec = nip19.decode(randomNsec);
      let encodedChange = getEncodedToken({
        token: [
          {
            mint: mints[0],
            proofs: changeProofs,
          },
        ],
      });
      const paymentMessage = "Overpaid fee change: " + encodedChange;
      axios({
        method: "POST",
        url: "/api/nostr/post-event",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          pubkey: decryptedRandomNpub.data,
          privkey: decryptedRandomNsec.data,
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [["p", pubkey]],
          content: paymentMessage,
          relays: relays,
        },
      });
    }
    setShowModal(false);
  };

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
              <div className="ml-2">Redeemed</div>
            </div>
            {isCashu ? (
              <div className="items-center justify-center">
                Sign in to{" "}
                <Link href="https://npub.cash/claim" passHref legacyBehavior>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    npub.cash
                  </a>
                </Link>{" "}
                with your Nostr keys to claim your sats! Would you like to
                donate your overpaid Lightning fees ({formattedChangeAmount}) to
                support the development of Shopstr?
              </div>
            ) : (
              <div className="flex items-center justify-center">
                Check your Lightning address ({lnurl}) for your sats! Would you
                like to donate your overpaid Lightning fees (
                {formattedChangeAmount}) to support the development of Shopstr?
              </div>
            )}
            <div className="flex w-full flex-wrap justify-evenly gap-2">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES + " mt-2 w-[20%]"}
                onClick={() =>
                  sendChange(
                    "a37118a4888e02d28e8767c08caaf73b49abdac391ad7ff18a304891e416dc33",
                  )
                }
                startContent={
                  <ArrowUpTrayIcon className="h-6 w-6 hover:text-yellow-500" />
                }
              >
                Donate
              </Button>
              <Button
                className={SHOPSTRBUTTONCLASSNAMES + " mt-2 w-[20%]"}
                onClick={() => sendChange(decryptedNpub)}
                startContent={
                  <ArrowDownTrayIcon className="h-6 w-6 hover:text-yellow-500" />
                }
              >
                Keep
              </Button>
            </div>
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
              <div className="ml-2">Redemption Failed</div>
            </div>
            <div className="items-center justify-center">
              You are attempting to redeem a token that has already been
              redeemed, is too small/large, or for which there were no payment
              routes found. Copy the token string (cashuA...) and head over{" "}
              <Link href="https://wallet.nutstash.app/" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Nutstash
                </a>
              </Link>{" "}
              to try and redeem it!
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
