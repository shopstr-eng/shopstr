import { useState, useEffect, useRef, useContext, use } from "react";
import { nip04 } from "nostr-tools";
import { Button } from "@nextui-org/react";
import { useRouter } from "next/router";
import {
  LocalStorageInterface,
  constructEncryptedMessageEvent,
  decryptNpub,
  getLocalStorageData,
  getPrivKeyWithPassphrase,
  sendEncryptedMessage,
  validPassphrase,
} from "../components/utility/nostr-helper-functions";
import { ProfileAvatar } from "../components/utility-components/profile/avatar";
import { ChatsContext } from "../context";
import { SHOPSTRBUTTONCLASSNAMES } from "../components/utility/STATIC-VARIABLES";
import RequestPassphraseModal from "../components/utility-components/request-passphrase-modal";
import {
  ArrowUturnLeftIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import ShopstrSpinner from "../components/utility-components/shopstr-spinner";
import axios from "axios";
import { ChatPanel } from "./chat-panel";
import { ProfileDisplayName } from "../components/utility-components/profile/display-name";
import { ChatButton } from "./chat-button";

const DirectMessages = () => {
  const router = useRouter();
  const chatsContext = useContext(ChatsContext);

  const [chatsMap, setChatsMap] = useState(new Map()); // Map<chatPubkey, chat>
  const [sortedChatsByLastMessage, setSortedChatsByLastMessage] = useState<
    [string, any[]][]
  >([]); // [chatPubkey, chat]
  const [currentChatPubkey, setCurrentChatPubkey] = useState("");

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [isSendingDMLoading, setIsSendingDMLoading] = useState(false);
  const [localStorageValues, setLocalStorageValues] =
    useState<LocalStorageInterface>(getLocalStorageData());

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    async function loadChats() {
      if (
        localStorageValues.signIn === "nsec" &&
        !validPassphrase(passphrase)
      ) {
        setEnterPassphrase(true); // prompt for passphrase when chatsContext is loaded
        return;
      }
      if (!chatsContext) {
        setIsChatsLoading(false);
        return;
      }
      if (
        localStorageValues.signIn === "nsec" &&
        !validPassphrase(passphrase)
      ) {
        setEnterPassphrase(true); // prompt for passphrase when chatsContext is loaded
      } else if (!chatsContext.isLoading && chatsContext.chatsMap) {
        // comes here only if signIn is extension or its nsec and passphrase is valid
        let decryptedChats = await getDecryptedChatsFromContext();
        const passedNPubkey = router.query.pk ? router.query.pk : null;
        if (passedNPubkey) {
          let decryptedNpub = decryptNpub(passedNPubkey as string) as string;
          if (!decryptedChats.has(decryptedNpub)) {
            decryptedChats.set(decryptedNpub as string, []);
          }
          enterChat(passedNPubkey as string);
        }
        setChatsMap(decryptedChats);
        setIsChatsLoading(chatsContext.isLoading);
        return;
      }
    }
    loadChats();
  }, [chatsContext, passphrase]);

  useEffect(() => {
    let sortedChatsByLastMessage = Array.from(chatsMap.entries()).sort(
      (a, b) => {
        if (a[1].length === 0) return -1;
        let aLastMessage = a[1][a[1].length - 1].created_at;
        let bLastMessage = b[1][b[1].length - 1].created_at;
        return bLastMessage - aLastMessage;
      },
    );
    setSortedChatsByLastMessage(sortedChatsByLastMessage);
  }, [chatsMap]);

  const getDecryptedChatsFromContext: () => Promise<
    Map<string, any[]>
  > = async () => {
    let decryptedChats = new Map(); //  entry: [chatPubkey, chat]
    for (let [chatPubkey, chat] of chatsContext.chatsMap) {
      let decryptedChat: MessageEvent[] = [];
      for (let messageEvent of chat) {
        try {
          let plaintext = "";
          if (localStorageValues.signIn === "extension") {
            plaintext = await window.nostr.nip04.decrypt(
              chatPubkey,
              messageEvent.content,
            );
          } else {
            let sk2 = getPrivKeyWithPassphrase(passphrase);
            plaintext = await nip04.decrypt(
              sk2,
              chatPubkey,
              messageEvent.content,
            );
          }
          decryptedChat.push({ ...messageEvent, content: plaintext });
        } catch (e) {
          console.log(e, "Error decrypting message.", messageEvent);
        }
      }
      decryptedChats.set(chatPubkey, decryptedChat);
    }

    return decryptedChats;
  };

  const enterChat = (npub: string) => {
    let pubkey = decryptNpub(npub);
    setCurrentChatPubkey(pubkey as string);
  };

  const goBackFromChatRoom = () => {
    // used when in chatroom on smaller devices
    setCurrentChatPubkey("");
  };

  const handleSendMessage = async (message: string) => {
    setIsSendingDMLoading(true);
    try {
      let encryptedMessageEvent = await constructEncryptedMessageEvent(
        localStorageValues.decryptedNpub,
        message,
        currentChatPubkey,
        passphrase,
      );
      await sendEncryptedMessage(encryptedMessageEvent, passphrase);
      // push message to chatsMap
      let updatedCurrentChat = chatsMap.get(currentChatPubkey);
      let unEncryptedMessageEvent = {
        ...encryptedMessageEvent,
        content: message,
      };
      updatedCurrentChat.push(unEncryptedMessageEvent);
      let newChatsMap = new Map(chatsMap);
      newChatsMap.set(currentChatPubkey, updatedCurrentChat);
      setChatsMap(newChatsMap);
      if (updatedCurrentChat.length <= 1) {
        // only logs if this is the first msg, aka an iniquiry
        axios({
          method: "POST",
          url: "/api/metrics/post-inquiry",
          headers: {
            "Content-Type": "application/json",
          },
          data: {
            customer_id: localStorageValues.decryptedNpub,
            merchant_id: currentChatPubkey,
            // listing_id: 'TODO'
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
  };

  const handleClickChat = (chat: string) => {
    setCurrentChatPubkey(chat);
  };

  return (
    <>
      <div>
        {chatsMap.size === 0 ? (
          <div className="mt-8 flex items-center justify-center">
            {isChatsLoading ? (
              <div className="mt-8 flex items-center justify-center">
                <ShopstrSpinner />
              </div>
            ) : (
              <p className="break-words text-center text-2xl dark:text-dark-text">
                {isClient && localStorageValues.decryptedNpub ? (
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
          // <div className="h-[85vh] overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
          <div className="flex flex-row">
            <div className="h-[85vh] w-full overflow-y-auto rounded-md dark:bg-dark-bg md:w-[450px] md:max-w-[33%] md:flex-shrink-0">
              {chatsMap &&
                sortedChatsByLastMessage.map(
                  ([pubkeyOfChat, messages]: [string, any[]]) => (
                    <ChatButton
                      pubkeyOfChat={pubkeyOfChat}
                      messages={messages}
                      openedChatPubkey={currentChatPubkey}
                      handleClickChat={handleClickChat}
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
    </>
  );
};

export default DirectMessages;
