// initialize new react funcitonal component
import { Button, Input } from "@nextui-org/react";
import React, { useEffect, useContext, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { nip19 } from "nostr-tools";
import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalBody,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import {
  ArrowUturnLeftIcon,
  ArrowsUpDownIcon,
  ChatBubbleLeftIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
} from "@heroicons/react/24/outline";
import { ChatObject, NostrMessageEvent } from "../../utils/types/types";
import { ChatMessage } from "./chat-message";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import {
  constructGiftWrappedMessageEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  publishReviewEvent,
  generateKeys,
  getLocalStorageData,
} from "../utility/nostr-helper-functions";
import { calculateWeightedScore } from "../utility/review-parser-functions";
import { ReviewsContext } from "../../utils/context/context";

export const ChatPanel = ({
  handleGoBack,
  handleSendMessage,
  currentChatPubkey,
  chatsMap,
  isSendingDMLoading,
  isPayment,
  passphrase,
}: {
  handleGoBack: () => void;
  handleSendMessage: (message: string) => Promise<void>;
  currentChatPubkey: string;
  chatsMap: Map<string, ChatObject>;
  isSendingDMLoading: boolean;
  isPayment: boolean;
  passphrase?: string;
}) => {
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<NostrMessageEvent[]>([]); // [chatPubkey, chat]
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const [randomNpubForSender, setRandomNpubForSender] = useState<string>("");
  const [randomNsecForSender, setRandomNsecForSender] = useState<string>("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] =
    useState<string>("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] =
    useState<string>("");

  const [buyerPubkey, setBuyerPubkey] = useState<string>("");

  const [canReview, setCanReview] = useState(false);

  const [selectedThumb, setSelectedThumb] = useState<"up" | "down" | null>(
    null,
  );
  const [reviewOptions, setReviewOptions] = useState<Map<string, number>>(
    new Map([
      ["value", 0],
      ["quality", 0],
      ["delivery", 0],
      ["communication", 0],
    ]),
  );
  const [productAddress, setProductAddress] = useState<string>("");

  const reviewsContext = useContext(ReviewsContext);

  const {
    handleSubmit: handleShippingSubmit,
    control: shippingControl,
    reset: shippingReset,
  } = useForm();

  const {
    handleSubmit: handleReviewSubmit,
    control: reviewControl,
    reset: reviewReset,
  } = useForm();

  const { userPubkey, userNPub } = getLocalStorageData();

  const bottomDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchKeys = async () => {
      const { nsec: nsecForSender, npub: npubForSender } = await generateKeys();
      setRandomNpubForSender(npubForSender);
      setRandomNsecForSender(nsecForSender);
      const { nsec: nsecForReceiver, npub: npubForReceiver } =
        await generateKeys();
      setRandomNpubForReceiver(npubForReceiver);
      setRandomNsecForReceiver(nsecForReceiver);
    };

    fetchKeys();
  }, []);

  useEffect(() => {
    setMessages(chatsMap.get(currentChatPubkey)?.decryptedChat || []);
  }, [currentChatPubkey, chatsMap]);

  useEffect(() => {
    bottomDivRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSendingDMLoading]);

  const handleToggleShippingModal = () => {
    shippingReset();
    setShowShippingModal(!showShippingModal);
  };

  const handleToggleReviewModal = () => {
    reviewReset();
    setShowReviewModal(!showReviewModal);
  };

  const onShippingSubmit = async (data: { [x: string]: any }) => {
    try {
      let decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      let decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      let decodedRandomPubkeyForReceiver = nip19.decode(randomNpubForReceiver);
      let decodedRandomPrivkeyForReceiver = nip19.decode(randomNsecForReceiver);

      let deliveryTime = data["Delivery Time"];
      let trackingUrl = data["Tracking Url"];
      let message =
        "Your order from " +
        userNPub +
        " is expected to arrive within " +
        deliveryTime +
        ". Check the following link to track it: " +
        trackingUrl;
      let giftWrappedMessageEvent = await constructGiftWrappedMessageEvent(
        decodedRandomPubkeyForSender.data as string,
        buyerPubkey,
        message,
        "shipping-info",
        undefined,
        productAddress,
      );
      let sealedEvent = await constructMessageSeal(
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        buyerPubkey,
        undefined,
        decodedRandomPrivkeyForSender.data as Uint8Array,
      );
      let giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        buyerPubkey,
      );
      await sendGiftWrappedMessageEvent(giftWrappedEvent);
      handleToggleShippingModal();
    } catch (error) {
      console.error(error);
    }
  };

  const onReviewSubmit = async (data: { [x: string]: any }) => {
    try {
      const [_, _kind, merchantPubkey, dTag] = productAddress.split(":");
      const eventTags = [
        ["d", `a:${productAddress}`],
        ["rating", (selectedThumb === "up" ? 1 : 0).toString(), "thumb"],
      ];
      reviewOptions.forEach((value, key) => {
        eventTags.push(["rating", value.toString(), key]);
      });
      const productReviewsData = new Map<string, string[][]>();
      productReviewsData.set(userPubkey, eventTags);
      await publishReviewEvent(data.comment, eventTags, passphrase);
      reviewsContext.updateProductReviewsData(
        merchantPubkey,
        dTag,
        productReviewsData,
      );
      const merchantScoresMap = reviewsContext.merchantReviewsData;
      if (!merchantScoresMap.has(merchantPubkey)) {
        merchantScoresMap.set(merchantPubkey, []);
      }
      merchantScoresMap
        .get(merchantPubkey)!
        .push(calculateWeightedScore(eventTags));
      reviewsContext.updateMerchantReviewsData(
        merchantPubkey,
        merchantScoresMap.get(merchantPubkey) || [
          calculateWeightedScore(eventTags),
        ],
      );
      handleToggleReviewModal();
    } catch (error) {
      console.error("Error submitting review:", error);
    }
  };

  if (!currentChatPubkey)
    return (
      <div className="absolute z-20 hidden h-[85vh] w-full flex-col overflow-clip px-2 dark:bg-dark-bg md:relative md:flex">
        <div className="flex h-full flex-col items-center justify-center">
          <ChatBubbleLeftIcon className="mb-5 mt-[-70px] h-20 w-20 text-light-text dark:text-dark-text" />
          <span className="text-5xl text-light-text dark:text-dark-text">
            No chat selected . . .
          </span>
          <div className="flex items-center justify-center gap-3 pt-5 opacity-10">
            <span className="text-2xl text-light-text dark:text-dark-text">
              Use your up and down arrow keys to select chats!
            </span>
            <ArrowsUpDownIcon className="h-10 w-10 text-light-text dark:text-dark-text" />
          </div>
        </div>
      </div>
    );

  const sendMessage = async () => {
    await handleSendMessage(messageInput);
    setMessageInput("");
  };

  return (
    <div className="absolute flex h-full w-full flex-col overflow-clip bg-light-bg px-2 pb-20 dark:bg-dark-bg md:relative md:h-[85vh] md:pb-0 lg:pb-0">
      <h2 className="flex h-[60px] w-full flex-row items-center overflow-clip align-middle text-shopstr-purple-light dark:text-shopstr-yellow-light">
        <ArrowUturnLeftIcon
          onClick={handleGoBack}
          className="mx-3 h-9 w-9 cursor-pointer rounded-md p-1 text-shopstr-purple-light hover:bg-shopstr-yellow hover:text-purple-700 dark:text-shopstr-yellow-light  hover:dark:bg-shopstr-purple"
        />
        <ProfileWithDropdown
          pubkey={currentChatPubkey}
          dropDownKeys={["shop"]}
          nameClassname="block"
        />
      </h2>
      <div className="my-2 h-full overflow-y-scroll rounded-md border-2 border-light-fg bg-light-fg p-3 dark:border-dark-fg dark:bg-dark-fg">
        {messages
          .filter(
            (message, index, self) =>
              index === self.findIndex((m) => m.id === message.id),
          )
          .map((messageEvent: NostrMessageEvent, index) => {
            return (
              <ChatMessage
                key={messageEvent.id}
                messageEvent={messageEvent}
                index={index}
                currentChatPubkey={currentChatPubkey}
                passphrase={passphrase}
                setBuyerPubkey={setBuyerPubkey}
                setCanReview={setCanReview}
                setProductAddress={setProductAddress}
              />
            );
          })}
        <div ref={bottomDivRef} />
      </div>
      {!isPayment ? (
        <div className="space-x flex items-center p-2">
          <Input
            className="pr-3 text-light-text dark:text-dark-text"
            type="text"
            width="100%"
            size="md"
            value={messageInput}
            placeholder="Type your message..."
            onChange={(e) => {
              setMessageInput(e.target.value);
            }}
            onKeyDown={async (e) => {
              if (
                e.key === "Enter" &&
                !(messageInput === "" || isSendingDMLoading)
              )
                await sendMessage();
            }}
          />
          <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            isDisabled={messageInput === "" || isSendingDMLoading}
            isLoading={isSendingDMLoading}
            onClick={async () => await sendMessage()}
          >
            Send
          </Button>
        </div>
      ) : !canReview && buyerPubkey ? (
        <>
          <div className="flex items-center justify-between border-t p-4">
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
              onClick={handleToggleShippingModal}
            >
              Send Shipping Info
            </Button>
          </div>
          <Modal
            backdrop="blur"
            isOpen={showShippingModal}
            onClose={handleToggleShippingModal}
            classNames={{
              body: "py-6",
              backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
              header: "border-b-[1px] border-[#292f46]",
              footer: "border-t-[1px] border-[#292f46]",
              closeButton: "hover:bg-black/5 active:bg-white/10",
            }}
            scrollBehavior={"outside"}
            size="2xl"
          >
            <ModalContent>
              <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
                Enter Shipping Details
              </ModalHeader>
              <form onSubmit={handleShippingSubmit(onShippingSubmit)}>
                <ModalBody>
                  <Controller
                    name="Delivery Time"
                    control={shippingControl}
                    rules={{
                      required: "Expected delivery time is required.",
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
                        <Input
                          autoFocus
                          label="Expected Delivery Time"
                          placeholder="e.g. 3-5 business days"
                          variant="bordered"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          className="text-light-text dark:text-dark-text"
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      );
                    }}
                  />
                  <Controller
                    name="Tracking Url"
                    control={shippingControl}
                    rules={{
                      required: "Tracking URL is required.",
                      pattern: {
                        value: /^https?:\/\/.+/i,
                        message:
                          "Please enter a valid URL starting with http:// or https://",
                      },
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
                        <Input
                          label="Tracking URL"
                          placeholder="https://..."
                          variant="bordered"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          className="text-light-text dark:text-dark-text"
                          onChange={onChange}
                          onBlur={onBlur}
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
                    onClick={handleToggleShippingModal}
                  >
                    Cancel
                  </Button>
                  <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                    Confirm Shipping
                  </Button>
                </ModalFooter>
              </form>
            </ModalContent>
          </Modal>
        </>
      ) : (
        productAddress !== "" && (
          <>
            <div className="flex items-center justify-between border-t p-4">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={handleToggleReviewModal}
              >
                Leave a Review
              </Button>
            </div>
            <Modal
              backdrop="blur"
              isOpen={showReviewModal}
              onClose={handleToggleReviewModal}
              classNames={{
                body: "py-6",
                backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                header: "border-b-[1px] border-[#292f46]",
                footer: "border-t-[1px] border-[#292f46]",
                closeButton: "hover:bg-black/5 active:bg-white/10",
              }}
              scrollBehavior={"outside"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
                  Leave a Review
                </ModalHeader>
                <form onSubmit={handleReviewSubmit(onReviewSubmit)}>
                  <ModalBody>
                    <div className="mb-4 flex items-center justify-center gap-16">
                      <div className="flex items-center gap-3">
                        <span className="text-light-text dark:text-dark-text">
                          Good Overall
                        </span>
                        <HandThumbUpIcon
                          className={`h-12 w-12 cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                            selectedThumb === "up"
                              ? "border-green-500 text-green-500"
                              : "border-light-text text-light-text hover:border-green-500 hover:text-green-500 dark:border-dark-text dark:text-dark-text"
                          }`}
                          onClick={() => setSelectedThumb("up")}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <HandThumbDownIcon
                          className={`h-12 w-12 cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                            selectedThumb === "down"
                              ? "border-red-500 text-red-500"
                              : "border-light-text text-light-text hover:border-red-500 hover:text-red-500 dark:border-dark-text dark:text-dark-text"
                          }`}
                          onClick={() => setSelectedThumb("down")}
                        />
                        <span className="text-light-text dark:text-dark-text">
                          Bad Overall
                        </span>
                      </div>
                    </div>

                    <div className="mb-4 flex flex-col gap-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={reviewOptions.get("value") === 1}
                          onChange={(e) =>
                            setReviewOptions((prev) => {
                              const newMap = new Map(prev);
                              newMap.set("value", e.target.checked ? 1 : 0);
                              return newMap;
                            })
                          }
                        />
                        <span className="text-light-text dark:text-dark-text">
                          Good Value
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={reviewOptions.get("quality") === 1}
                          onChange={(e) =>
                            setReviewOptions((prev) => {
                              const newMap = new Map(prev);
                              newMap.set("quality", e.target.checked ? 1 : 0);
                              return newMap;
                            })
                          }
                        />
                        <span className="text-light-text dark:text-dark-text">
                          Good Quality
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={reviewOptions.get("delivery") === 1}
                          onChange={(e) =>
                            setReviewOptions((prev) => {
                              const newMap = new Map(prev);
                              newMap.set("delivery", e.target.checked ? 1 : 0);
                              return newMap;
                            })
                          }
                        />
                        <span className="text-light-text dark:text-dark-text">
                          Quick Delivery
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={reviewOptions.get("communication") === 1}
                          onChange={(e) =>
                            setReviewOptions((prev) => {
                              const newMap = new Map(prev);
                              newMap.set(
                                "communication",
                                e.target.checked ? 1 : 0,
                              );
                              return newMap;
                            })
                          }
                        />
                        <span className="text-light-text dark:text-dark-text">
                          Good Communication
                        </span>
                      </label>
                    </div>

                    <Controller
                      name="comment"
                      control={reviewControl}
                      render={({ field }) => (
                        <textarea
                          {...field}
                          className="w-full rounded-md border-2 border-light-fg bg-light-bg p-2 text-light-text dark:border-dark-fg dark:bg-dark-bg dark:text-dark-text"
                          rows={4}
                          placeholder="Write your review comment here..."
                        />
                      )}
                    />
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      color="danger"
                      variant="light"
                      onClick={handleToggleReviewModal}
                    >
                      Cancel
                    </Button>
                    <Button
                      className={SHOPSTRBUTTONCLASSNAMES}
                      type="submit"
                      isDisabled={!selectedThumb}
                    >
                      Leave Review
                    </Button>
                  </ModalFooter>
                </form>
              </ModalContent>
            </Modal>
          </>
        )
      )}
    </div>
  );
};

export default ChatPanel;
