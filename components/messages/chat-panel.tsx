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
import {
  ArrowUturnLeftIcon,
  ArrowsUpDownIcon,
  ChatBubbleLeftIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
} from "@heroicons/react/24/outline";
import { ChatObject, NostrMessageEvent } from "../../utils/types/types";
import ChatMessage from "./chat-message";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  publishReviewEvent,
  generateKeys,
} from "@/utils/nostr/nostr-helper-functions";
import { calculateWeightedScore } from "@/utils/parsers/review-parser-functions";
import { ReviewsContext } from "../../utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const ChatPanel = ({
  handleGoBack,
  handleSendMessage,
  currentChatPubkey,
  chatsMap,
  isSendingDMLoading,
  isPayment,
}: {
  handleGoBack: () => void;
  handleSendMessage: (message: string) => Promise<void>;
  currentChatPubkey: string;
  chatsMap: Map<string, ChatObject>;
  isSendingDMLoading: boolean;
  isPayment: boolean;
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
    null
  );
  const [reviewOptions, setReviewOptions] = useState<Map<string, number>>(
    new Map([
      ["value", 0],
      ["quality", 0],
      ["delivery", 0],
      ["communication", 0],
    ])
  );
  const [productAddress, setProductAddress] = useState("");
  const [orderId, setOrderId] = useState("");

  const reviewsContext = useContext(ReviewsContext);

  const {
    handleSubmit: handleShippingSubmit,
    control: shippingControl,
    reset: shippingReset,
  } = useForm({
    defaultValues: {
      "Delivery Time": "",
      "Shipping Carrier": "",
      "Tracking Number": "",
    },
  });

  const {
    handleSubmit: handleReviewSubmit,
    control: reviewControl,
    reset: reviewReset,
  } = useForm({
    defaultValues: {
      comment: "",
    },
  });

  const {
    signer,
    pubkey: userPubkey,
    npub: userNPub,
  } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

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

  const handleMarkAsCompleted = async () => {
    try {
      if (!signer || !nostr || !buyerPubkey) return;

      const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      const decodedRandomPubkeyForReceiver = nip19.decode(
        randomNpubForReceiver
      );
      const decodedRandomPrivkeyForReceiver = nip19.decode(
        randomNsecForReceiver
      );

      // Get shipping info from the most recent shipping message
      const shippingInfo = {
        tracking: "",
        carrier: "",
        eta: 0,
      };

      // Find the most recent shipping-info message
      const shippingMessage = messages
        .slice()
        .reverse()
        .find((msg) => {
          const subject = msg.tags.find((tag) => tag[0] === "subject")?.[1];
          return subject === "shipping-info";
        });

      if (shippingMessage) {
        const trackingTag = shippingMessage.tags.find(
          (tag) => tag[0] === "tracking"
        );
        const carrierTag = shippingMessage.tags.find(
          (tag) => tag[0] === "carrier"
        );
        const etaTag = shippingMessage.tags.find((tag) => tag[0] === "eta");

        if (trackingTag) shippingInfo.tracking = trackingTag[1] || "";
        if (carrierTag) shippingInfo.carrier = carrierTag[1] || "";
        if (etaTag) shippingInfo.eta = parseInt(etaTag[1] || "0");
      }

      const message =
        "Your order from " +
        userNPub +
        " has been completed." +
        (shippingInfo.tracking ? " Tracking: " + shippingInfo.tracking : "") +
        (shippingInfo.carrier ? " Carrier: " + shippingInfo.carrier : "");

      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        decodedRandomPubkeyForSender.data as string,
        buyerPubkey,
        message,
        "order-completed",
        {
          productAddress,
          type: 3,
          status: "completed",
          isOrder: true,
          orderId,
          ...(shippingInfo.tracking && { tracking: shippingInfo.tracking }),
          ...(shippingInfo.carrier && { carrier: shippingInfo.carrier }),
          ...(shippingInfo.eta && { eta: shippingInfo.eta }),
        }
      );

      const sealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        buyerPubkey,
        decodedRandomPrivkeyForSender.data as Uint8Array
      );

      const giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        buyerPubkey
      );

      await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent);
    } catch (error) {
      console.error("Error marking order as completed:", error);
    }
  };

  const handleToggleReviewModal = () => {
    reviewReset();
    setShowReviewModal(!showReviewModal);
  };

  const onShippingSubmit = async (data: { [x: string]: string }) => {
    try {
      const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      const decodedRandomPubkeyForReceiver = nip19.decode(
        randomNpubForReceiver
      );
      const decodedRandomPrivkeyForReceiver = nip19.decode(
        randomNsecForReceiver
      );

      // Convert delivery days to future unix timestamp
      const daysToAdd = parseInt(data["Delivery Time"]!);
      const currentTimestamp = Math.floor(Date.now() / 1000); // Current unix timestamp in seconds
      const futureTimestamp = currentTimestamp + daysToAdd * 24 * 60 * 60; // Add days in seconds

      // Create a human-readable date format
      const humanReadableDate = new Date(
        futureTimestamp * 1000
      ).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const shippingCarrier = data["Shipping Carrier"];
      const trackingNumber = data["Tracking Number"];
      const message =
        "Your order from " +
        userNPub +
        " is expected to arrive on " +
        humanReadableDate +
        ". Your " +
        shippingCarrier +
        " tracking number is: " +
        trackingNumber;
      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        decodedRandomPubkeyForSender.data as string,
        buyerPubkey,
        message,
        "shipping-info",
        {
          productAddress,
          type: 4, // Shipping update type
          status: "shipped",
          isOrder: true,
          orderId,
          tracking: trackingNumber,
          carrier: shippingCarrier,
          eta: futureTimestamp,
        }
      );
      const sealedEvent = await constructMessageSeal(
        signer!,
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        buyerPubkey,
        decodedRandomPrivkeyForSender.data as Uint8Array
      );
      const giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        buyerPubkey
      );
      await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent);
      handleToggleShippingModal();
    } catch (error) {
      console.error(error);
    }
  };

  const onReviewSubmit = async (data: { [x: string]: string }) => {
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
      productReviewsData.set(userPubkey!, eventTags);
      await publishReviewEvent(nostr!, signer!, data.comment!, eventTags);
      reviewsContext.updateProductReviewsData(
        merchantPubkey!,
        dTag!,
        productReviewsData
      );
      const merchantScoresMap = reviewsContext.merchantReviewsData;
      if (!merchantScoresMap.has(merchantPubkey!)) {
        merchantScoresMap.set(merchantPubkey!, []);
      }
      merchantScoresMap
        .get(merchantPubkey!)!
        .push(calculateWeightedScore(eventTags));
      reviewsContext.updateMerchantReviewsData(
        merchantPubkey!,
        merchantScoresMap.get(merchantPubkey!) || [
          calculateWeightedScore(eventTags),
        ]
      );
      handleToggleReviewModal();
    } catch (error) {
      console.error("Error submitting review:", error);
    }
  };

  if (!currentChatPubkey)
    return (
      <div className="absolute z-20 hidden h-[85vh] w-full flex-col overflow-clip rounded-r-2xl border border-l-0 border-zinc-800 bg-[#161616] px-2 md:relative md:flex">
        <div className="mt-10 flex flex-grow items-center justify-center py-10">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#111] p-10 text-center shadow-xl">
            <ChatBubbleLeftIcon className="mx-auto mb-5 h-20 w-20 text-zinc-600" />
            <span className="block text-4xl font-black uppercase text-white">
              No chat selected . . .
            </span>
            <div className="opacity-4 flex flex-col items-center justify-center gap-3 pt-5">
              <span className="text-xl font-bold text-zinc-500">
                Use your up and down arrow keys to select chats!
              </span>
              <ArrowsUpDownIcon className="h-10 w-10 text-zinc-600" />
            </div>
          </div>
        </div>
      </div>
    );

  const sendMessage = async () => {
    await handleSendMessage(messageInput);
    setMessageInput("");
  };

  return (
    <div className="absolute flex h-full w-full flex-col overflow-clip rounded-r-2xl border border-l-0 border-zinc-800 bg-[#161616] px-2 pb-20 md:relative md:h-[85vh] md:pb-0 lg:pb-0">
      <h2 className="flex h-[60px] w-full flex-row items-center overflow-clip align-middle text-yellow-400">
        <ArrowUturnLeftIcon
          onClick={handleGoBack}
          className="mx-3 h-9 w-9 cursor-pointer rounded-md p-1 text-yellow-400 hover:bg-zinc-800 hover:text-white"
        />
        <ProfileWithDropdown
          pubkey={currentChatPubkey}
          dropDownKeys={["shop"]}
          nameClassname="block"
        />
      </h2>
      <div className="my-2 h-full overflow-y-scroll rounded-xl border border-zinc-800 bg-[#111] p-3">
        {messages
          .filter(
            (message, index, self) =>
              index === self.findIndex((m) => m.id === message.id)
          )
          .map((messageEvent: NostrMessageEvent, index) => {
            return (
              <ChatMessage
                key={messageEvent.id}
                messageEvent={messageEvent}
                index={index}
                currentChatPubkey={currentChatPubkey}
                setBuyerPubkey={setBuyerPubkey}
                setCanReview={setCanReview}
                setProductAddress={setProductAddress}
                setOrderId={setOrderId}
              />
            );
          })}
        <div ref={bottomDivRef} />
      </div>
      {!isPayment ? (
        <div className="space-x flex items-center gap-2 p-2">
          <Input
            classNames={{
              input: "text-white placeholder:text-zinc-500",
              inputWrapper:
                "h-12 border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
            }}
            variant="bordered"
            type="text"
            width="100%"
            size="lg"
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
            className={`${NEO_BTN} h-12 px-8 text-sm`}
            isDisabled={messageInput === "" || isSendingDMLoading}
            isLoading={isSendingDMLoading}
            onClick={async () => await sendMessage()}
          >
            Send
          </Button>
        </div>
      ) : !canReview && buyerPubkey ? (
        <>
          <div className="flex w-full items-center justify-center border-t border-zinc-800 p-4 sm:justify-between">
            <Button
              className="h-10 w-full rounded-xl border border-zinc-600 bg-transparent px-6 text-sm font-bold uppercase tracking-wider text-white hover:border-white hover:bg-zinc-800 sm:w-auto"
              onClick={handleToggleShippingModal}
            >
              Send Shipping Info
            </Button>
            <Button
              className={`${NEO_BTN} h-10 w-full px-6 text-sm sm:w-auto`}
              onClick={handleMarkAsCompleted}
            >
              Mark as Completed
            </Button>
          </div>
          <Modal
            backdrop="blur"
            isOpen={showShippingModal}
            onClose={handleToggleShippingModal}
            classNames={{
              base: "bg-[#161616] border border-zinc-800",
              body: "py-6 text-zinc-300",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              footer: "border-t border-zinc-800",
              closeButton: "hover:bg-black/5 active:bg-white/10",
            }}
            scrollBehavior={"outside"}
            size="2xl"
          >
            <ModalContent>
              <ModalHeader className="flex flex-col gap-1">
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
                      const isErrored = error !== undefined;
                      const errorMessage: string = error?.message
                        ? error.message
                        : "";
                      return (
                        <Input
                          autoFocus
                          label="Expected Delivery Time (days)"
                          placeholder="e.g. 3"
                          variant="bordered"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          classNames={{
                            label: "text-zinc-500",
                            input: "text-white",
                            inputWrapper:
                              "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                          }}
                          type="number"
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      );
                    }}
                  />
                  <Controller
                    name="Shipping Carrier"
                    control={shippingControl}
                    rules={{
                      required: "A shipping carrier is required.",
                    }}
                    render={({
                      field: { onChange, onBlur, value },
                      fieldState: { error },
                    }) => {
                      const isErrored = error !== undefined;
                      const errorMessage: string = error?.message
                        ? error.message
                        : "";
                      return (
                        <Input
                          label="Shipping Carrier"
                          variant="bordered"
                          placeholder="Fedex, UPS, etc. "
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          classNames={{
                            label: "text-zinc-500",
                            input: "text-white",
                            inputWrapper:
                              "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                          }}
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      );
                    }}
                  />
                  <Controller
                    name="Tracking Number"
                    control={shippingControl}
                    rules={{
                      required: "A tracking number is required.",
                      minLength: {
                        value: 5,
                        message:
                          "Tracking number must be at least 5 characters.",
                      },
                    }}
                    render={({
                      field: { onChange, onBlur, value },
                      fieldState: { error },
                    }) => {
                      const isErrored = error !== undefined;
                      const errorMessage: string = error?.message
                        ? error.message
                        : "";
                      return (
                        <Input
                          label="Tracking Number"
                          variant="bordered"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          classNames={{
                            label: "text-zinc-500",
                            input: "text-white",
                            inputWrapper:
                              "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                          }}
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
                  <Button
                    className={`${NEO_BTN} h-10 px-6 text-sm`}
                    type="submit"
                  >
                    Confirm Shipping
                  </Button>
                </ModalFooter>
              </form>
            </ModalContent>
          </Modal>
        </>
      ) : (
        productAddress &&
        buyerPubkey && (
          <>
            <div className="flex flex-col gap-3 border-t border-zinc-800 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                className={`${NEO_BTN} h-10 px-6 text-sm`}
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
                base: "bg-[#161616] border border-zinc-800",
                body: "py-6 text-zinc-300",
                backdrop: "bg-black/80 backdrop-blur-sm",
                header: "border-b border-zinc-800 text-white",
                footer: "border-t border-zinc-800",
                closeButton: "hover:bg-black/5 active:bg-white/10",
              }}
              scrollBehavior={"outside"}
              size="2xl"
            >
              <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                  Leave a Review
                </ModalHeader>
                <form onSubmit={handleReviewSubmit(onReviewSubmit)}>
                  <ModalBody>
                    <div className="mb-4 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-16">
                      <div className="flex items-center gap-3">
                        <span className="font-bold uppercase tracking-wider text-white">
                          Good Overall
                        </span>
                        <HandThumbUpIcon
                          className={`h-12 w-12 cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                            selectedThumb === "up"
                              ? "border-green-500 text-green-500"
                              : "border-zinc-600 text-zinc-400 hover:border-green-500 hover:text-green-500"
                          }`}
                          onClick={() => setSelectedThumb("up")}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <HandThumbDownIcon
                          className={`h-12 w-12 cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                            selectedThumb === "down"
                              ? "border-red-500 text-red-500"
                              : "border-zinc-600 text-zinc-400 hover:border-red-500 hover:text-red-500"
                          }`}
                          onClick={() => setSelectedThumb("down")}
                        />
                        <span className="font-bold uppercase tracking-wider text-white">
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
                        <span className="text-zinc-300">Good Value</span>
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
                        <span className="text-zinc-300">Good Quality</span>
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
                        <span className="text-zinc-300">Quick Delivery</span>
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
                                e.target.checked ? 1 : 0
                              );
                              return newMap;
                            })
                          }
                        />
                        <span className="text-zinc-300">
                          Good Communication
                        </span>
                      </label>
                    </div>

                    <Controller
                      name="comment"
                      control={reviewControl}
                      rules={{ required: "A comment is required." }}
                      render={({ field, fieldState: { error } }) => (
                        <div>
                          <textarea
                            {...field}
                            className="w-full rounded-md border border-zinc-700 bg-[#111] p-2 text-white placeholder-zinc-500 focus:border-yellow-400 focus:outline-none"
                            rows={4}
                            placeholder="Write your review comment here..."
                          />
                          {error && (
                            <p className="text-red-500">{error.message}</p>
                          )}
                        </div>
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
                      className={`${NEO_BTN} h-10 px-6 text-sm`}
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
