import { useState, useEffect, useContext } from "react";
import { Filter, nip19, nip44, SimplePool } from "nostr-tools";
import { useRouter } from "next/router";
import {
  constructGiftWrappedMessageEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  decryptNpub,
  getLocalStorageData,
  validPassphrase,
  getPrivKeyWithPassphrase,
  sendBunkerRequest,
  awaitBunkerResponse,
} from "../utility/nostr-helper-functions";
import { ChatsContext } from "../../utils/context/context";
import RequestPassphraseModal from "../utility-components/request-passphrase-modal";
import ShopstrSpinner from "../utility-components/shopstr-spinner";
import axios from "axios";
import { ChatPanel } from "./chat-panel";
import { ChatButton } from "./chat-button";
import { Button } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { NostrMessageEvent, ChatObject } from "../../utils/types/types";
import {
  addChatMessagesToCache,
  fetchChatMessagesFromCache,
} from "../../pages/api/nostr/cache-service";
import { useKeyPress } from "../utility/functions";
import { DateTime } from "luxon";
import FailureModal from "../utility-components/failure-modal";

const Messages = ({ isPayment }: { isPayment: boolean }) => {
  const router = useRouter();
  const chatsContext = useContext(ChatsContext);
  const arrowUpPressed = useKeyPress("ArrowUp");
  const arrowDownPressed = useKeyPress("ArrowDown");
  const escapePressed = useKeyPress("Escape");

  const [chatsMap, setChatsMap] = useState<Map<string, ChatObject>>(new Map()); // Map<chatPubkey, chat>
  const [sortedChatsByLastMessage, setSortedChatsByLastMessage] = useState<
    [string, ChatObject][]
  >([]); // [chatPubkey, chat]
  const [currentChatPubkey, setCurrentChatPubkey] = useState("");

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [oldestTimestamp, setOldestTimestamp] = useState(Number.MAX_VALUE);

  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [isSendingDMLoading, setIsSendingDMLoading] = useState(false);
  const { signInMethod, userPubkey } = getLocalStorageData();

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
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setRandomNpubForSender(response.data.npub);
        setRandomNsecForSender(response.data.nsec);
      })
      .catch((error) => {
        console.error(error);
      });
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setRandomNpubForReceiver(response.data.npub);
        setRandomNsecForReceiver(response.data.nsec);
      })
      .catch((error) => {
        console.error(error);
      });
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
      if (signInMethod === "nsec" && !validPassphrase(passphrase)) {
        setEnterPassphrase(true); // prompt for passphrase when chatsContext is loaded
      } else if (
        !chatsContext.isLoading &&
        chatsContext.chatsMap &&
        !isLoadingMore
      ) {
        // comes here only if signInMethod is extension or its nsec and passphrase is valid
        let decryptedChats = await getDecryptedChatsFromContext();
        const passedNPubkey = router.query.pk ? router.query.pk : null;
        if (passedNPubkey) {
          let pubkey = decryptNpub(passedNPubkey as string) as string;
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
  }, [chatsContext, passphrase, isPayment]);

  useEffect(() => {
    let sortedChatsByLastMessage = Array.from(chatsMap.entries()).sort(
      (a: [string, ChatObject], b: [string, ChatObject]) => {
        if (a[1].decryptedChat.length === 0) return -1;
        let aLastMessage =
          a[1].decryptedChat.length > 0
            ? a[1].decryptedChat[a[1].decryptedChat.length - 1].created_at
            : 0;
        let bLastMessage =
          b[1].decryptedChat.length > 0
            ? b[1].decryptedChat[b[1].decryptedChat.length - 1].created_at
            : 0;
        return bLastMessage - aLastMessage;
      },
    );
    setSortedChatsByLastMessage(sortedChatsByLastMessage);
  }, [chatsMap]);

  // useEffect used to traverse chats via arrow keys
  useEffect(() => {
    if (chatsMap.size === 0 || isChatsLoading) return;
    if (arrowUpPressed) {
      if (currentChatPubkey === "") {
        setCurrentChatPubkey(sortedChatsByLastMessage[0][0]);
      } else {
        let index = sortedChatsByLastMessage.findIndex(
          ([pubkey, chatObject]) => pubkey === currentChatPubkey,
        );
        if (index > 0) enterChat(sortedChatsByLastMessage[index - 1][0]);
      }
    }
    if (arrowDownPressed) {
      if (currentChatPubkey === "") {
        setCurrentChatPubkey(sortedChatsByLastMessage[0][0]);
      } else {
        let index = sortedChatsByLastMessage.findIndex(
          ([pubkey, chatObject]) => pubkey === currentChatPubkey,
        );
        if (index < sortedChatsByLastMessage.length - 1)
          enterChat(sortedChatsByLastMessage[index + 1][0]);
      }
    }
    if (escapePressed) {
      goBackFromChatRoom();
    }
  }, [arrowUpPressed, arrowDownPressed, escapePressed]);

  const getDecryptedChatsFromContext: () => Promise<
    Map<string, ChatObject>
  > = async () => {
    let decryptedChats: Map<string, ChatObject> = new Map(); //  entry: [chatPubkey, chat]
    let chatMessagesFromCache: Map<string, NostrMessageEvent> =
      await fetchChatMessagesFromCache();
    for (let entry of chatsContext.chatsMap) {
      let chatPubkey = entry[0] as string;
      let chat = entry[1] as NostrMessageEvent[];
      let decryptedChat: NostrMessageEvent[] = [];
      let unreadCount = 0;

      for (let messageEvent of chat) {
        let plainText;
        let tagsMap: Map<string, string> = new Map();
        if (messageEvent.kind === 14) {
          plainText = messageEvent.content;
          tagsMap = new Map(
            messageEvent.tags
              .filter((tag): tag is [string, string] => tag.length === 2)
              .map(([k, v]) => [k, v]),
          );
        }
        let subject = tagsMap.get("subject") ? tagsMap.get("subject") : null;
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
      let updatedChat = prevChatMap.get(pubkeyOfChat) as ChatObject;
      if (updatedChat) {
        updatedChat.unreadCount = 0;
        let encryptedChat = chatsContext.chatsMap.get(
          pubkeyOfChat,
        ) as NostrMessageEvent[];
        if (!encryptedChat) return prevChatMap;
        encryptedChat.forEach((message) => {
          message.read = true;
        });
        let newChatMap = new Map(prevChatMap);
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
      let decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      let decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      let decodedRandomPubkeyForReceiver = nip19.decode(randomNpubForReceiver);
      let decodedRandomPrivkeyForReceiver = nip19.decode(randomNsecForReceiver);
      let giftWrappedMessageEvent = await constructGiftWrappedMessageEvent(
        userPubkey,
        currentChatPubkey,
        message,
        "listing-inquiry",
      );
      let receiverSealedEvent = await constructMessageSeal(
        giftWrappedMessageEvent,
        userPubkey,
        currentChatPubkey,
        passphrase,
      );
      let senderSealedEvent = await constructMessageSeal(
        giftWrappedMessageEvent,
        userPubkey,
        userPubkey,
        passphrase,
      );
      let senderGiftWrappedEvent = await constructMessageGiftWrap(
        senderSealedEvent,
        decodedRandomPubkeyForSender.data as string,
        decodedRandomPrivkeyForSender.data as Uint8Array,
        userPubkey,
      );
      let receiverGiftWrappedEvent = await constructMessageGiftWrap(
        receiverSealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        currentChatPubkey,
      );
      await sendGiftWrappedMessageEvent(senderGiftWrappedEvent);
      await sendGiftWrappedMessageEvent(receiverGiftWrappedEvent);
      chatsContext.addNewlyCreatedMessageEvent(
        {
          ...giftWrappedMessageEvent,
          sig: "",
          read: true,
        },
        true,
      );
      addChatMessagesToCache([
        { ...giftWrappedMessageEvent, sig: "", read: true },
      ]);
      setIsSendingDMLoading(false);
    } catch (e) {
      console.log("handleSendMessage errored", e);
      setFailureText("Error sending inquiry.");
      setShowFailureModal(true);
      setIsSendingDMLoading(false);
    }
  };

  const loadMoreMessages = async () => {
    try {
      setIsLoadingMore(true);
      if (isChatsLoading) return;
      setIsChatsLoading(true);
      let oldestMessageCreatedAt = Math.trunc(DateTime.now().toSeconds());
      for (const [chatPubkey, chatObject] of chatsMap.entries()) {
        for (const messageEvent of chatObject.decryptedChat) {
          if (messageEvent.created_at < oldestMessageCreatedAt) {
            oldestMessageCreatedAt = messageEvent.created_at;
          }
        }
      }
      if (oldestMessageCreatedAt > oldestTimestamp) {
        oldestMessageCreatedAt = oldestTimestamp;
      }
      const since = Math.trunc(
        DateTime.fromSeconds(oldestMessageCreatedAt)
          .minus({ days: 14 })
          .toSeconds(),
      );
      setOldestTimestamp(since);
      const relays = getLocalStorageData().relays;
      const readRelays = getLocalStorageData().readRelays;
      const allReadRelays = [...relays, ...readRelays];
      const pool = new SimplePool();
      const giftWrapFilter: Filter = {
        kinds: [1059],
        "#p": [userPubkey],
        since,
        until: oldestMessageCreatedAt,
      };
      const giftWrapEvents = await pool.querySync(
        allReadRelays,
        giftWrapFilter,
      );
      let giftWrapMessageEvents: NostrMessageEvent[] = [];
      for (const event of giftWrapEvents) {
        if (signInMethod === "extension") {
          let sealEventString = await window.nostr.nip44.decrypt(
            event.pubkey,
            event.content,
          );
          let sealEvent = JSON.parse(sealEventString);
          if (sealEvent.kind === 13) {
            let messageEventString = await window.nostr.nip44.decrypt(
              sealEvent.pubkey,
              sealEvent.content,
            );
            let messageEventCheck = JSON.parse(messageEventString);
            if (
              messageEventCheck.kind === 14 &&
              messageEventCheck.pubkey === sealEvent.pubkey
            ) {
              let pubkeyChats = chatsMap.get(messageEventCheck.pubkey)
                ?.decryptedChat;
              if (
                (pubkeyChats &&
                  pubkeyChats.length > 0 &&
                  pubkeyChats.some((msg) => msg.id != messageEventCheck.id)) ||
                !pubkeyChats ||
                (pubkeyChats && pubkeyChats.length === 0)
              ) {
                giftWrapMessageEvents.push({
                  ...messageEventCheck,
                  sig: "",
                  read: false,
                });
              }
            }
          }
        } else if (signInMethod === "bunker") {
          const sealEventDecryptId = crypto.randomUUID();
          await sendBunkerRequest(
            "nip44_decrypt",
            sealEventDecryptId,
            undefined,
            event.content,
            event.pubkey,
          );
          let sealEventString;
          while (!sealEventString) {
            sealEventString = await awaitBunkerResponse(sealEventDecryptId);
            if (!sealEventString) {
              await new Promise((resolve) => setTimeout(resolve, 2100));
            }
          }
          let sealEvent = JSON.parse(sealEventString);
          sealEvent = JSON.parse(sealEvent);
          if (sealEvent.kind === 13) {
            const messageEventDecryptId = crypto.randomUUID();
            await sendBunkerRequest(
              "nip44_decrypt",
              messageEventDecryptId,
              undefined,
              sealEvent.content,
              sealEvent.pubkey,
            );
            let messageEventString;
            while (!messageEventString) {
              messageEventString = await awaitBunkerResponse(
                messageEventDecryptId,
              );
              if (!messageEventString) {
                await new Promise((resolve) => setTimeout(resolve, 2100));
              }
            }
            let messageEventCheck = JSON.parse(messageEventString);
            if (
              messageEventCheck.kind === 14 &&
              messageEventCheck.pubkey === sealEvent.pubkey
            ) {
              let pubkeyChats = chatsMap.get(messageEventCheck.pubkey)
                ?.decryptedChat;
              if (
                (pubkeyChats &&
                  pubkeyChats.length > 0 &&
                  pubkeyChats.some((msg) => msg.id != messageEventCheck.id)) ||
                !pubkeyChats ||
                (pubkeyChats && pubkeyChats.length === 0)
              ) {
                giftWrapMessageEvents.push({
                  ...messageEventCheck,
                  sig: "",
                  read: false,
                });
              }
            }
          }
        } else if (signInMethod === "nsec") {
          if (!passphrase) throw new Error("Passphrase is required");
          let userPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
          const giftWrapConversationKey = nip44.getConversationKey(
            userPrivkey,
            event.pubkey,
          );
          let sealEventString = nip44.decrypt(
            event.content,
            giftWrapConversationKey,
          );
          let sealEvent = JSON.parse(sealEventString);
          if (sealEvent.kind === 13) {
            let sealConversationKey = nip44.getConversationKey(
              userPrivkey,
              sealEvent.pubkey,
            );
            let messageEventString = nip44.decrypt(
              sealEvent.content,
              sealConversationKey,
            );
            let messageEventCheck = JSON.parse(messageEventString);
            if (
              messageEventCheck.kind === 14 &&
              messageEventCheck.pubkey === sealEvent.pubkey
            ) {
              let pubkeyChats = chatsMap.get(messageEventCheck.pubkey)
                ?.decryptedChat;
              if (
                (pubkeyChats &&
                  pubkeyChats.length > 0 &&
                  pubkeyChats.some((msg) => msg.id != messageEventCheck.id)) ||
                !pubkeyChats ||
                (pubkeyChats && pubkeyChats.length === 0)
              ) {
                giftWrapMessageEvents.push({
                  ...messageEventCheck,
                  sig: "",
                  read: false,
                });
              }
            }
          }
        } else if (signInMethod === "amber") {
          const readClipboard = (): Promise<string> => {
            return new Promise((resolve, reject) => {
              const checkClipboard = async () => {
                try {
                  if (!document.hasFocus()) {
                    console.log("Document not focused, waiting for focus...");
                    return;
                  }

                  const clipboardContent = await navigator.clipboard.readText();

                  if (clipboardContent && clipboardContent !== "") {
                    clearInterval(intervalId);
                    let eventContent = clipboardContent;

                    let parsedContent = JSON.parse(eventContent);

                    resolve(parsedContent);
                  } else {
                    console.log("Waiting for new clipboard content...");
                  }
                } catch (error) {
                  console.error("Error reading clipboard:", error);
                  reject(error);
                }
              };

              checkClipboard();
              const intervalId = setInterval(checkClipboard, 1000);

              setTimeout(() => {
                clearInterval(intervalId);
                console.log("Amber decryption timeout");
                alert("Amber decryption timed out. Please try again.");
              }, 60000);
            });
          };

          try {
            const giftWrapAmberSignerUrl = `nostrsigner:${event.content}?pubKey=${event.pubkey}&compressionType=none&returnType=signature&type=nip44_decrypt`;

            await navigator.clipboard.writeText("");

            window.open(giftWrapAmberSignerUrl, "_blank");

            let sealEventString = await readClipboard();
            let sealEvent = JSON.parse(sealEventString);
            if (sealEvent.kind == 13) {
              const sealAmberSignerUrl = `nostrsigner:${sealEvent.content}?pubKey=${event.pubkey}&compressionType=none&returnType=signature&type=nip44_decrypt`;

              await navigator.clipboard.writeText("");

              window.open(sealAmberSignerUrl, "_blank");

              let messageEventString = await readClipboard();
              let messageEventCheck = JSON.parse(messageEventString);
              if (
                messageEventCheck.kind === 14 &&
                messageEventCheck.pubkey === sealEvent.pubkey
              ) {
                let pubkeyChats = chatsMap.get(messageEventCheck.pubkey)
                  ?.decryptedChat;
                if (
                  (pubkeyChats &&
                    pubkeyChats.length > 0 &&
                    pubkeyChats.some(
                      (msg) => msg.id != messageEventCheck.id,
                    )) ||
                  !pubkeyChats ||
                  (pubkeyChats && pubkeyChats.length === 0)
                ) {
                  giftWrapMessageEvents.push({
                    ...messageEventCheck,
                    sig: "",
                    read: false,
                  });
                }
              }
            }
          } catch (error) {
            console.error("Error reading clipboard:", error);
            alert("Amber decryption failed. Please try again.");
          }
        }
      }
      const olderMessages = giftWrapMessageEvents;
      olderMessages.sort((a, b) => b.created_at - a.created_at);
      // Combine the newly fetched messages with the existing chatsMap
      const combinedChatsMap = new Map(chatsMap);
      olderMessages.forEach((messageEvent) => {
        let chatArray;
        if (messageEvent.pubkey === userPubkey) {
          let recipientPubkey = messageEvent.tags.find(
            (tag) => tag[0] === "p",
          )?.[1];
          if (recipientPubkey) {
            chatArray =
              combinedChatsMap.get(recipientPubkey)?.decryptedChat || [];
            chatArray.push(messageEvent);
            combinedChatsMap.set(recipientPubkey, {
              unreadCount: chatArray.filter((event) => !event.read).length,
              decryptedChat: chatArray,
            });
          }
        } else {
          chatArray =
            combinedChatsMap.get(messageEvent.pubkey)?.decryptedChat || [];
          chatArray.push(messageEvent);
          combinedChatsMap.set(messageEvent.pubkey, {
            unreadCount: chatArray.filter((event) => !event.read).length,
            decryptedChat: chatArray,
          });
        }
        chatsContext.addNewlyCreatedMessageEvent(messageEvent);
        addChatMessagesToCache([messageEvent]);
      });
      setIsChatsLoading(false);
      setIsLoadingMore(false);
    } catch (err) {
      console.log(err);
      setIsChatsLoading(false);
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="h-[100vh] bg-light-bg dark:bg-dark-bg">
      <div>
        {chatsMap.size === 0 ? (
          <div className="mt-2 flex items-center justify-center">
            {isChatsLoading ? (
              <div className="mt-8 flex items-center justify-center">
                <ShopstrSpinner />
              </div>
            ) : (
              <div className="break-words text-center text-2xl text-light-text dark:text-dark-text">
                {isClient && userPubkey ? (
                  <>
                    No messages . . . yet!
                    <br></br>
                    <br></br>
                    Just logged in?
                    <br></br>
                    Try reloading the page, or load more!
                    {isChatsLoading || isLoadingMore ? (
                      <div className="mt-8 flex items-center justify-center">
                        <ShopstrSpinner />
                      </div>
                    ) : (
                      <div className="mt-8 h-20 px-4">
                        <Button
                          className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                          onClick={async () => await loadMoreMessages()}
                        >
                          Load More . . .
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <>You must be signed in to see your chats!</>
                )}
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
                },
              )}
              {isChatsLoading || isLoadingMore ? (
                <div className="mt-8 flex items-center justify-center">
                  <ShopstrSpinner />
                </div>
              ) : chatsMap.size != 0 ? (
                <div className="mt-8 h-20 px-4">
                  <Button
                    className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                    onClick={async () => await loadMoreMessages()}
                  >
                    Load More . . .
                  </Button>
                </div>
              ) : null}
            </div>
            <ChatPanel
              handleGoBack={goBackFromChatRoom}
              chatsMap={chatsMap}
              currentChatPubkey={currentChatPubkey}
              isSendingDMLoading={isSendingDMLoading}
              handleSendMessage={handleSendGiftWrappedMessage}
              isPayment={isPayment}
              passphrase={passphrase}
            />
          </div>
        )}
      </div>
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
      />
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
