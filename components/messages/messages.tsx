import { useState, useEffect, useContext } from "react";
import { nip19 } from "nostr-tools";
import { useRouter } from "next/router";
import { Button, useDisclosure } from "@nextui-org/react";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  decryptNpub,
  generateKeys,
} from "@/utils/nostr/nostr-helper-functions";
import { ChatsContext } from "../../utils/context/context";
import ShopstrSpinner from "../utility-components/shopstr-spinner";
import ChatPanel from "./chat-panel";
import ChatButton from "./chat-button";
import { NostrMessageEvent, ChatObject } from "../../utils/types/types";
import {
  addChatMessagesToCache,
  fetchChatMessagesFromCache,
} from "@/utils/nostr/cache-service";
import { useKeyPress } from "@/utils/keypress-handler";
import FailureModal from "../utility-components/failure-modal";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import SignInModal from "../sign-in/SignInModal";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const Messages = ({ isPayment }: { isPayment: boolean }) => {
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const chatsContext = useContext(ChatsContext);
  const arrowUpPressed = useKeyPress("ArrowUp");
  const arrowDownPressed = useKeyPress("ArrowDown");
  const escapePressed = useKeyPress("Escape");

  const [chatsMap, setChatsMap] = useState<Map<string, ChatObject>>(new Map()); // Map<chatPubkey, chat>
  const [sortedChatsByLastMessage, setSortedChatsByLastMessage] = useState<
    [string, ChatObject][]
  >([]); // [chatPubkey, chat]
  const [currentChatPubkey, setCurrentChatPubkey] = useState("");

  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [isSendingDMLoading, setIsSendingDMLoading] = useState(false);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const [isClient, setIsClient] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const [randomNpubForSender, setRandomNpubForSender] = useState<string>("");
  const [randomNsecForSender, setRandomNsecForSender] = useState<string>("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] =
    useState<string>("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] =
    useState<string>("");

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
    setIsClient(true);
  }, []);

  useEffect(() => {
    async function loadChats() {
      if (!chatsContext) {
        setIsChatsLoading(false);
        return;
      }
      if (!chatsContext.isLoading && chatsContext.chatsMap) {
        // comes here only if signInMethod is extension or its nsec and passphrase is valid
        const decryptedChats = await getDecryptedChatsFromContext();
        const passedNPubkey = router.query.pk ? router.query.pk : null;
        if (passedNPubkey) {
          const pubkey = decryptNpub(passedNPubkey as string) as string;
          if (!decryptedChats.has(pubkey)) {
            decryptedChats.set(pubkey as string, {
              unreadCount: 0,
              decryptedChat: [],
            });
          }
          enterChat(pubkey);
        }
        setChatsMap(decryptedChats);
        if (currentChatPubkey) {
          // if the current chat is already open, mark all messages as read
          markAllMessagesAsReadInChatRoom(currentChatPubkey);
        }
        setIsChatsLoading(chatsContext.isLoading);
        return;
      }
    }
    loadChats();
  }, [chatsContext, isPayment]);

  useEffect(() => {
    const sortedChatsByLastMessage = Array.from(chatsMap.entries()).sort(
      (a: [string, ChatObject], b: [string, ChatObject]) => {
        if (a[1].decryptedChat.length === 0) return -1;
        const aLastMessage =
          a[1].decryptedChat.length > 0
            ? a[1].decryptedChat[a[1].decryptedChat.length - 1]!.created_at
            : 0;
        const bLastMessage =
          b[1].decryptedChat.length > 0
            ? b[1].decryptedChat[b[1].decryptedChat.length - 1]!.created_at
            : 0;
        return bLastMessage - aLastMessage;
      }
    );
    setSortedChatsByLastMessage(sortedChatsByLastMessage);
  }, [chatsMap]);

  // useEffect used to traverse chats via arrow keys
  useEffect(() => {
    if (chatsMap.size === 0 || isChatsLoading) return;
    if (arrowUpPressed) {
      if (currentChatPubkey === "") {
        setCurrentChatPubkey(sortedChatsByLastMessage[0]![0]);
      } else {
        const index = sortedChatsByLastMessage.findIndex(
          ([pubkey, _]) => pubkey === currentChatPubkey
        );
        if (index > 0) enterChat(sortedChatsByLastMessage[index - 1]![0]);
      }
    }
    if (arrowDownPressed) {
      if (currentChatPubkey === "") {
        setCurrentChatPubkey(sortedChatsByLastMessage[0]![0]);
      } else {
        const index = sortedChatsByLastMessage.findIndex(
          ([pubkey, _]) => pubkey === currentChatPubkey
        );
        if (index < sortedChatsByLastMessage.length - 1)
          enterChat(sortedChatsByLastMessage[index + 1]![0]);
      }
    }
    if (escapePressed) {
      goBackFromChatRoom();
    }
  }, [arrowUpPressed, arrowDownPressed, escapePressed]);

  const getDecryptedChatsFromContext: () => Promise<
    Map<string, ChatObject>
  > = async () => {
    const decryptedChats: Map<string, ChatObject> = new Map(); //  entry: [chatPubkey, chat]
    const chatMessagesFromCache: Map<string, NostrMessageEvent> =
      await fetchChatMessagesFromCache();
    for (const entry of chatsContext.chatsMap) {
      const chatPubkey = entry[0] as string;
      const chat = entry[1] as NostrMessageEvent[];
      const decryptedChat: NostrMessageEvent[] = [];
      let unreadCount = 0;

      for (const messageEvent of chat) {
        let plainText;
        let tagsMap: Map<string, string> = new Map();
        if (messageEvent.kind === 14) {
          plainText = messageEvent.content;
          tagsMap = new Map(
            messageEvent.tags
              .filter((tag): tag is [string, string] => tag.length === 2)
              .map(([k, v]) => [k, v])
          );
        }
        const subject = tagsMap.get("subject") ? tagsMap.get("subject") : null;
        if (
          (isPayment &&
            subject &&
            (subject === "order-payment" ||
              subject === "order-info" ||
              subject === "payment-change" ||
              subject === "order-receipt" ||
              subject === "shipping-info")) ||
          (!isPayment && subject && subject === "listing-inquiry")
        ) {
          plainText &&
            decryptedChat.push({ ...messageEvent, content: plainText });
          if (chatMessagesFromCache.get(messageEvent.id)?.read === false) {
            unreadCount++;
          }
        }
      }
      if (decryptedChat.length > 0) {
        decryptedChats.set(chatPubkey, { unreadCount, decryptedChat });
      }
    }
    return decryptedChats;
  };

  const markAllMessagesAsReadInChatRoom = (pubkeyOfChat: string) => {
    setChatsMap((prevChatMap) => {
      const updatedChat = prevChatMap.get(pubkeyOfChat) as ChatObject;
      if (updatedChat) {
        updatedChat.unreadCount = 0;
        const encryptedChat = chatsContext.chatsMap.get(
          pubkeyOfChat
        ) as NostrMessageEvent[];
        if (!encryptedChat) return prevChatMap;
        encryptedChat.forEach((message) => {
          message.read = true;
        });
        const newChatMap = new Map(prevChatMap);
        newChatMap.set(pubkeyOfChat, updatedChat);
        addChatMessagesToCache(encryptedChat);
        return newChatMap;
      }
      return prevChatMap;
    });
  };

  const enterChat = (pubkeyOfChat: string) => {
    setCurrentChatPubkey(pubkeyOfChat as string);
    // mark all messages in chat as read
    markAllMessagesAsReadInChatRoom(pubkeyOfChat as string);
  };

  const goBackFromChatRoom = () => {
    // used when in chatroom on smaller devices
    setCurrentChatPubkey("");
  };

  const handleSendGiftWrappedMessage = async (message: string) => {
    setIsSendingDMLoading(true);
    try {
      const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      const decodedRandomPubkeyForReceiver = nip19.decode(
        randomNpubForReceiver
      );
      const decodedRandomPrivkeyForReceiver = nip19.decode(
        randomNsecForReceiver
      );
      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        userPubkey!,
        currentChatPubkey,
        message,
        "listing-inquiry"
      );
      const receiverSealedEvent = await constructMessageSeal(
        signer!,
        giftWrappedMessageEvent,
        userPubkey!,
        currentChatPubkey
      );
      const senderSealedEvent = await constructMessageSeal(
        signer!,
        giftWrappedMessageEvent,
        userPubkey!,
        userPubkey!
      );
      const senderGiftWrappedEvent = await constructMessageGiftWrap(
        senderSealedEvent,
        decodedRandomPubkeyForSender.data as string,
        decodedRandomPrivkeyForSender.data as Uint8Array,
        userPubkey!
      );
      const receiverGiftWrappedEvent = await constructMessageGiftWrap(
        receiverSealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        currentChatPubkey
      );
      await sendGiftWrappedMessageEvent(nostr!, senderGiftWrappedEvent);
      await sendGiftWrappedMessageEvent(nostr!, receiverGiftWrappedEvent);
      chatsContext.addNewlyCreatedMessageEvent(
        {
          ...giftWrappedMessageEvent,
          sig: "",
          read: true,
        },
        true
      );
      addChatMessagesToCache([
        { ...giftWrappedMessageEvent, sig: "", read: true },
      ]);

      setIsSendingDMLoading(false);
    } catch (_) {
      setFailureText("Error sending inquiry.");
      setShowFailureModal(true);
      setIsSendingDMLoading(false);
    }
  };

  // Function to handle page reload
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-light-bg text-gray-800 dark:bg-dark-bg dark:text-gray-200">
      <div className="container mx-auto px-4 py-10">
        {chatsMap.size === 0 ? (
          <div className="flex h-[66vh] items-center justify-center">
            {isChatsLoading ? (
              <div className="flex items-center justify-center">
                <ShopstrSpinner />
              </div>
            ) : (
              <div className="mx-auto w-full max-w-lg rounded-xl bg-white p-10 shadow-xl transition-all dark:bg-gray-800">
                <div className="text-center">
                  {isClient && userPubkey ? (
                    <div className="space-y-6">
                      <h2 className="text-3xl font-semibold text-gray-700 dark:text-gray-100">
                        No messages... yet!
                      </h2>
                      <div className="mt-2 text-base text-gray-600 dark:text-gray-300">
                        <p>Just logged in?</p>
                        <p className="mt-1 font-medium">
                          Try reloading the page.
                        </p>
                      </div>
                      <div className="pt-4">
                        <Button
                          onClick={handleReload}
                          className={`${SHOPSTRBUTTONCLASSNAMES} mt-6`}
                        >
                          Reload
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-100">
                        You must be signed in to see your chats!
                      </h2>
                      <div className="pt-4">
                        <Button
                          onClick={onOpen}
                          className={`${SHOPSTRBUTTONCLASSNAMES} mt-6`}
                        >
                          Sign In
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-row">
            <div className="h-[85vh] w-full overflow-y-auto rounded-md pb-12 dark:bg-dark-bg md:w-[450px] md:max-w-[33%] md:flex-shrink-0 md:pb-0 lg:pb-0">
              {sortedChatsByLastMessage.map(
                ([pubkeyOfChat, chatObject]: [string, ChatObject]) => {
                  return (
                    <ChatButton
                      key={pubkeyOfChat}
                      pubkeyOfChat={pubkeyOfChat}
                      chatObject={chatObject}
                      openedChatPubkey={currentChatPubkey}
                      handleClickChat={enterChat}
                    />
                  );
                }
              )}
            </div>
            <ChatPanel
              handleGoBack={goBackFromChatRoom}
              chatsMap={chatsMap}
              currentChatPubkey={currentChatPubkey}
              isSendingDMLoading={isSendingDMLoading}
              handleSendMessage={handleSendGiftWrappedMessage}
              isPayment={isPayment}
            />
          </div>
        )}
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </div>
  );
};

export default Messages;
