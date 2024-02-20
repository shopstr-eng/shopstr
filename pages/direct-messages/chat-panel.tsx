// initialize new react funcitonal component
import { Button, Input } from "@nextui-org/react";
import React, { useEffect, useRef, useState } from "react";
import { SHOPSTRBUTTONCLASSNAMES } from "../components/utility/STATIC-VARIABLES";
import {
  ArrowUturnLeftIcon,
  ArrowsUpDownIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { getLocalStorageData } from "../components/utility/nostr-helper-functions";
import { ProfileAvatar } from "../components/utility-components/profile/avatar";
import { ChatObject, NostrEvent, NostrMessageEvent } from "../types";
import { ChatMessage } from "./chat-message";

export const ChatPanel = ({
  handleGoBack,
  handleSendMessage,
  currentChatPubkey,
  chatsMap,
  isSendingDMLoading,
}: {
  handleGoBack: () => void;
  handleSendMessage: (message: string) => void;
  currentChatPubkey: string;
  chatsMap: Map<string, ChatObject>;
  isSendingDMLoading: boolean;
}) => {
  const { decryptedNpub } = getLocalStorageData();
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<NostrMessageEvent[]>([]); // [chatPubkey, chat]

  const bottomDivRef = useRef(null);

  useEffect(() => {
    setMessages(chatsMap.get(currentChatPubkey)?.decryptedChat || []);
  }, [currentChatPubkey, chatsMap]);

  useEffect(() => {
    bottomDivRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSendingDMLoading]);

  if (!currentChatPubkey)
    return (
      <div className="absolute z-20 hidden h-[85vh] w-full flex-col overflow-clip px-2 dark:bg-dark-bg md:relative md:flex">
        <div className="flex h-full flex-col items-center justify-center">
          <ChatBubbleLeftIcon className="mb-5 mt-[-70px] h-20 w-20 text-light-text dark:text-dark-text" />
          <span className="text-5xl text-light-text dark:text-dark-text">
            No Chat Selected
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

  const sendMessage = () => {
    handleSendMessage(messageInput);
    setMessageInput("");
  };

  return (
    <div className="absolute z-20 flex h-[85vh] w-full flex-col overflow-clip px-2 dark:bg-dark-bg md:relative">
      <h2 className="mt-2 flex h-[60px] w-full flex-row items-center overflow-clip pr-2 align-middle text-shopstr-purple-light dark:text-shopstr-yellow-light">
        <ArrowUturnLeftIcon
          onClick={handleGoBack}
          className="mx-3 h-9 w-9 cursor-pointer rounded-md p-1 text-shopstr-purple-light hover:bg-shopstr-yellow hover:text-purple-700 dark:text-shopstr-yellow-light  hover:dark:bg-shopstr-purple"
        />
        <ProfileAvatar
          pubkey={currentChatPubkey}
          className=""
          includeDisplayName
        />
      </h2>
      <div className="my-2 h-full overflow-y-scroll rounded-md border-2 border-light-fg bg-light-fg p-3 dark:border-dark-fg dark:bg-dark-fg">
        {messages.map((messageEvent: NostrEvent, index) => {
          return (
            <ChatMessage
              messageEvent={messageEvent}
              index={index}
              currentChatPubkey={currentChatPubkey}
            />
          );
        })}
        <div ref={bottomDivRef} />
      </div>
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
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !(messageInput === "" || isSendingDMLoading)
            )
              sendMessage();
          }}
        />
        <Button
          className={SHOPSTRBUTTONCLASSNAMES}
          isDisabled={messageInput === "" || isSendingDMLoading}
          isLoading={isSendingDMLoading}
          onClick={sendMessage}
        >
          Send
        </Button>
      </div>
    </div>
  );
};
