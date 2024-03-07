import { useState, useEffect, useContext } from "react";
import { nip04 } from "nostr-tools";
import { useRouter } from "next/router";
import {
  constructEncryptedMessageEvent,
  decryptNpub,
  getLocalStorageData,
  getPrivKeyWithPassphrase,
  sendEncryptedMessage,
  validPassphrase,
} from "../../components/utility/nostr-helper-functions";
import { ChatsContext } from "../../utils/context/context";
import RequestPassphraseModal from "../../components/utility-components/request-passphrase-modal";
import ShopstrSpinner from "../../components/utility-components/shopstr-spinner";
import axios from "axios";
import { ChatPanel } from "../../components/messages/chat-panel";
import { ChatButton } from "../../components/messages/chat-button";
import { NostrMessageEvent, ChatObject } from "../../utils/types/types";
import {
  addChatMessagesToCache,
  fetchChatMessagesFromCache,
} from "../api/nostr/cache-service";
import { useKeyPress } from "../../components/utility/functions";

const DirectMessages = () => {
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

  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [isSendingDMLoading, setIsSendingDMLoading] = useState(false);
  const { signInMethod, userPubkey } = getLocalStorageData();

  const [isClient, setIsClient] = useState(false);

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
      } else if (!chatsContext.isLoading && chatsContext.chatsMap) {
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
  }, [chatsContext, passphrase]);

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

  const decryptEncryptedMessageContent = async (
    messageEvent: NostrMessageEvent,
    chatPubkey: string,
  ) => {
    try {
      let plaintext = "";
      if (signInMethod === "extension") {
        plaintext = await window.nostr.nip04.decrypt(
          chatPubkey,
          messageEvent.content,
        );
      } else {
        let sk2 = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
        plaintext = await nip04.decrypt(sk2, chatPubkey, messageEvent.content);
      }
      return plaintext;
    } catch (e) {
      console.error(e, "Error decrypting message.", messageEvent);
    }
  };

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
        let plainText = await decryptEncryptedMessageContent(
          messageEvent,
          chatPubkey,
        );
        plainText &&
          decryptedChat.push({ ...messageEvent, content: plainText });
        if (chatMessagesFromCache.get(messageEvent.id)?.read === false) {
          unreadCount++;
        }
      }
      decryptedChats.set(chatPubkey, { unreadCount, decryptedChat });
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

  const handleSendMessage = async (message: string) => {
    setIsSendingDMLoading(true);
    try {
      let encryptedMessageEvent = await constructEncryptedMessageEvent(
        userPubkey,
        message,
        currentChatPubkey,
        passphrase,
      );
      await sendEncryptedMessage(encryptedMessageEvent, passphrase);
      // update chats locally to reflect new message
      setChatsMap((prevChatMap) => {
        let updatedChat = prevChatMap.get(currentChatPubkey) as ChatObject;
        let unEncryptedMessageEvent: NostrMessageEvent = {
          ...encryptedMessageEvent,
          content: message,
          read: true,
          id: "mock-id",
          sig: "mock-sig",
        };
        let updatedDecryptedChat = updatedChat.decryptedChat
          ? [...updatedChat.decryptedChat, unEncryptedMessageEvent]
          : [];
        let newChatMap = new Map(prevChatMap);
        newChatMap.set(currentChatPubkey, {
          decryptedChat: updatedDecryptedChat,
          unreadCount: 0,
        });
        return newChatMap;
      });
      if (
        chatsMap.get(currentChatPubkey) != undefined &&
        chatsMap.get(currentChatPubkey)?.decryptedChat.length === 0
      ) {
        // only logs if this is the first msg, aka an iniquiry
        axios({
          method: "POST",
          url: "/api/metrics/post-inquiry",
          headers: {
            "Content-Type": "application/json",
          },
          data: {
            customer_id: userPubkey,
            merchant_id: currentChatPubkey,
            // listing_id: "TODO"
            // relays: relays,
          },
        });
      }
      setIsSendingDMLoading(false);
    } catch (e) {
      console.log("handleSendMessage errored", e);
      alert("Error sending message.");
      setIsSendingDMLoading(false);
    }
    router.replace(`/messages`);
  };

  return (
    <div className="flex h-[100vh] flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      <span className="mb-4 flex px-4 text-2xl font-bold text-light-text dark:text-dark-text">
        Messages
      </span>
      <div>
        {chatsMap.size === 0 ? (
          <div className="mt-2 flex items-center justify-center">
            {isChatsLoading ? (
              <div className="mt-8 flex items-center justify-center">
                <ShopstrSpinner />
              </div>
            ) : (
              <p className="break-words text-center text-2xl text-light-text dark:text-dark-text">
                {isClient && userPubkey ? (
                  <>
                    No messages . . . yet!
                    <br></br>
                    <br></br>
                    Just logged in?
                    <br></br>
                    Try reloading the page!
                  </>
                ) : (
                  <>You must be signed in to see your chats!</>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-row">
            <div className="h-[85vh] w-full overflow-y-auto rounded-md dark:bg-dark-bg md:w-[450px] md:max-w-[33%] md:flex-shrink-0">
              {chatsMap &&
                sortedChatsByLastMessage.map(
                  ([pubkeyOfChat, chatObject]: [string, ChatObject]) => (
                    // eslint-disable-next-line react/jsx-key
                    <ChatButton
                      pubkeyOfChat={pubkeyOfChat}
                      chatObject={chatObject}
                      openedChatPubkey={currentChatPubkey}
                      handleClickChat={enterChat}
                    />
                  ),
                )}
            </div>
            <ChatPanel
              handleGoBack={goBackFromChatRoom}
              chatsMap={chatsMap}
              currentChatPubkey={currentChatPubkey}
              isSendingDMLoading={isSendingDMLoading}
              handleSendMessage={handleSendMessage}
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
    </div>
  );
};

export default DirectMessages;
