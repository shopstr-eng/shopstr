import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import {
  CashuMint,
  CashuWallet,
  getDecodedToken,
  Proof,
} from "@cashu/cashu-ts";

const ReceiveButton = () => {
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);
  const [isSpent, setIsSpent] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(false);

  const { mints, tokens, history } = getLocalStorageData();

  const {
    handleSubmit: handleReceiveSubmit,
    formState: { errors },
    control: receiveControl,
    reset: receiveReset,
  } = useForm();

  const handleToggleReceiveModal = () => {
    receiveReset();
    setShowReceiveModal(!showReceiveModal);
  };

  const onReceiveSubmit = async (data: { [x: string]: any }) => {
    let tokenString = data["token"];
    await handleReceive(tokenString);
  };

  const handleReceive = async (tokenString: string) => {
    setIsClaimed(false);
    setIsSpent(false);
    setIsInvalidToken(false);
    try {
      const token = getDecodedToken(tokenString);
      const tokenEntry = token.token;
      const tokenMint = tokenEntry[0].mint;
      const tokenProofs = tokenEntry[0].proofs;
      const wallet = new CashuWallet(new CashuMint(tokenMint));
      const spentProofs = await wallet?.checkProofsSpent(tokenProofs);
      if (spentProofs.length === 0) {
        const tokenArray = [...tokens, ...tokenProofs];
        localStorage.setItem("tokens", JSON.stringify(tokenArray));
        if (!mints.includes(tokenMint)) {
          const updatedMints = [...mints, tokenMint];
          localStorage.setItem("mints", JSON.stringify(updatedMints));
        }
        setIsClaimed(true);
        handleToggleReceiveModal();
        const transactionAmount = tokenProofs.reduce(
          (acc, token: Proof) => acc + token.amount,
          0,
        );
        localStorage.setItem(
          "history",
          JSON.stringify([
            {
              type: 1,
              amount: transactionAmount,
              date: Math.floor(Date.now() / 1000),
            },
            ...history,
          ]),
        );
      } else {
        setIsSpent(true);
      }
    } catch (error) {
      console.log(error);
      setIsInvalidToken(true);
    }
  };

  return (
    <>
      <div>
        <Button
          className={SHOPSTRBUTTONCLASSNAMES + " m-2"}
          onClick={() => setShowReceiveModal(!showReceiveModal)}
          startContent={
            <ArrowDownTrayIcon className="h-6 w-6 hover:text-yellow-500 dark:hover:text-purple-500" />
          }
        >
          Receive
        </Button>
        <Modal
          backdrop="blur"
          isOpen={showReceiveModal}
          onClose={handleToggleReceiveModal}
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
            <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
              Receive Token
            </ModalHeader>
            <form onSubmit={handleReceiveSubmit(onReceiveSubmit)}>
              <ModalBody>
                <Controller
                  name="token"
                  control={receiveControl}
                  rules={{
                    required: "A Cashu token string is required.",
                    validate: (value) =>
                      /^(web\+cashu:\/\/|cashu:\/\/|cashu:|cashuA)/.test(
                        value,
                      ) ||
                      "The token must start with 'web+cashu://', 'cashu://', 'cashu:', or 'cashuA'.",
                  }}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    let isErrored = error !== undefined;
                    let errorMessage: string = error?.message
                      ? error.message
                      : "";
                    return (
                      <Textarea
                        className="text-light-text dark:text-dark-text"
                        autoFocus
                        variant="bordered"
                        fullWidth={true}
                        label="Cashu token string"
                        labelPlacement="inside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />
              </ModalBody>

              <ModalFooter>
                <Button
                  color="danger"
                  variant="light"
                  onClick={handleToggleReceiveModal}
                >
                  Cancel
                </Button>

                <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                  Receive
                </Button>
              </ModalFooter>
            </form>
          </ModalContent>
        </Modal>
      </div>
      {isClaimed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isClaimed}
            onClose={() => setIsClaimed(false)}
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
                  <div className="ml-2">Token successfully claimed!</div>
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {isInvalidToken ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isInvalidToken}
            onClose={() => setIsInvalidToken(false)}
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
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Invalid token!</div>
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {isSpent ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isSpent}
            onClose={() => setIsSpent(false)}
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
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Token already spent!</div>
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
    </>
  );
};

export default ReceiveButton;
