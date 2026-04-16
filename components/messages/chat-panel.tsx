// initialize new react funcitonal component
import { Button, Input } from "@heroui/react";
import {
  useEffect,
  useContext,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useForm, Controller } from "react-hook-form";
import { nip19 } from "nostr-tools";
import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalBody,
} from "@heroui/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
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
import FailureModal from "../utility-components/failure-modal";
import { getLatestShippingInfo } from "@/utils/messages/order-message-utils";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

const ChatPanel = ({
  handleGoBack,
  handleSendMessage,
  currentChatPubkey,
  chatsMap,
  isSendingDMLoading,
  isPayment,
  initialMessage,
}: {
  handleGoBack: () => void;
  handleSendMessage: (message: string) => Promise<void>;
  currentChatPubkey: string;
  chatsMap: Map<string, ChatObject>;
  isSendingDMLoading: boolean;
  isPayment: boolean;
  initialMessage?: string;
}) => {
  const FIELD_LABELS: Record<string, string> = {
    tracking: "Tracking number",
    carrier: "Carrier",
  };

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
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

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
    if (initialMessage) {
      setMessageInput(initialMessage);
    }
  }, [initialMessage]);

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

      const shippingInfo = getLatestShippingInfo(messages);

      // Intentional: only block completion if a shipping-info message exists but is incomplete.
      // If no shipping-info message has been sent yet, the seller may be completing a
      // non-physical or pre-shipping order, so we allow it to proceed without shipping data.
      if (shippingInfo && shippingInfo.missingFields.length > 0) {
        setFailureText(
          `Cannot complete this order yet. Missing shipping fields: ${shippingInfo.missingFields
            .map((field) => FIELD_LABELS[field] ?? field)
            .join(", ")}.`
        );
        setShowFailureModal(true);
        return;
      }

      const message =
        "Your order from " +
        userNPub +
        " has been completed." +
        (shippingInfo?.tracking ? " Tracking: " + shippingInfo.tracking : "") +
        (shippingInfo?.carrier ? " Carrier: " + shippingInfo.carrier : "");

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
          ...(shippingInfo?.tracking && { tracking: shippingInfo.tracking }),
          ...(shippingInfo?.carrier && { carrier: shippingInfo.carrier }),
          ...(shippingInfo?.eta && { eta: shippingInfo.eta }),
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
      <div className="dark:bg-dark-bg absolute z-20 hidden h-[85vh] w-full flex-col overflow-clip px-2 md:relative md:flex">
        <div className="mt-10 flex flex-grow items-center justify-center py-10">
          <div className="bg-light-fg dark:bg-dark-fg w-full max-w-xl rounded-lg p-10 text-center shadow-lg">
            <ChatBubbleLeftIcon className="text-light-text dark:text-dark-text mx-auto mb-5 h-20 w-20" />
            <span className="text-light-text dark:text-dark-text block text-5xl">
              No chat selected . . .
            </span>
            <div className="flex flex-col items-center justify-center gap-3 pt-5 opacity-4">
              <span className="text-light-text dark:text-dark-text text-2xl">
                Use your up and down arrow keys to select chats!
              </span>
              <ArrowsUpDownIcon className="text-light-text dark:text-dark-text h-10 w-10" />
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
    <div className="bg-light-bg dark:bg-dark-bg absolute flex h-full w-full flex-col overflow-clip px-2 pb-20 md:relative md:h-[85vh] md:pb-0 lg:pb-0">
      <h2 className="text-shopstr-purple-light dark:text-shopstr-yellow-light flex h-[60px] w-full flex-row items-center overflow-clip align-middle">
        <ArrowUturnLeftIcon
          onClick={handleGoBack}
          className="text-shopstr-purple-light hover:bg-shopstr-yellow dark:text-shopstr-yellow-light hover:dark:bg-shopstr-purple mx-3 h-9 w-9 cursor-pointer rounded-md p-1 hover:text-purple-700"
        />
        <ProfileWithDropdown
          pubkey={currentChatPubkey}
          dropDownKeys={["shop"]}
          nameClassname="block"
        />
      </h2>
      <div className="border-light-fg bg-light-fg dark:border-dark-fg dark:bg-dark-fg my-2 h-full overflow-y-scroll rounded-md border-2 p-3">
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
        <div className="space-x flex items-center p-2">
          <Input
            className="text-light-text dark:text-dark-text pr-3"
            type="text"
            width="100%"
            size="md"
            value={messageInput}
            placeholder="Type your message..."
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setMessageInput(e.target.value);
            }}
            onKeyDown={async (e: KeyboardEvent<HTMLInputElement>) => {
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
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
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
              <ModalHeader className="text-light-text dark:text-dark-text flex flex-col gap-1">
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
                          className="text-light-text dark:text-dark-text"
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
                          className="text-light-text dark:text-dark-text"
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
          <FailureModal
            bodyText={failureText}
            isOpen={showFailureModal}
            onClose={() => {
              setShowFailureModal(false);
              setFailureText("");
            }}
          />
        </>
      ) : (
        productAddress &&
        buyerPubkey && (
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
                <ModalHeader className="text-light-text dark:text-dark-text flex flex-col gap-1">
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
                              : "border-light-text text-light-text dark:border-dark-text dark:text-dark-text hover:border-green-500 hover:text-green-500"
                          }`}
                          onClick={() => setSelectedThumb("up")}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <HandThumbDownIcon
                          className={`h-12 w-12 cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                            selectedThumb === "down"
                              ? "border-red-500 text-red-500"
                              : "border-light-text text-light-text dark:border-dark-text dark:text-dark-text hover:border-red-500 hover:text-red-500"
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
                                e.target.checked ? 1 : 0
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
                      rules={{ required: "A comment is required." }}
                      render={({ field, fieldState: { error } }) => (
                        <div>
                          <textarea
                            {...field}
                            className="border-light-fg bg-light-bg text-light-text dark:border-dark-fg dark:bg-dark-bg dark:text-dark-text w-full rounded-md border-2 p-2"
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
