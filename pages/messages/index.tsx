import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { ChatsContext, ProfileMapContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Image,
  Button,
  Divider,
  Tabs,
  Tab,
  Input,
  Textarea,
  Spinner,
  Avatar,
  ScrollShadow,
} from "@nextui-org/react";
import { ChatBubbleLeftIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

export default function MessagesPage() {
  const router = useRouter();
  const { pubkey } = useContext(SignerContext);
  const chatsContext = useContext(ChatsContext);
  const profileContext = useContext(ProfileMapContext);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState<any[]>([]);

  useEffect(() => {
    if (chatsContext && pubkey) {
      const chatList = Array.from(chatsContext.chatsMap.values());
      setChats(chatList);
    }
  }, [chatsContext, pubkey]);

  const handleSendMessage = () => {
    if (!message.trim() || !selectedChat) return;
    // TODO: Implement message sending logic
    setMessage("");
  };

  const getProfilePicture = (pubkey: string) => {
    const profile = profileContext.profileData.get(pubkey);
    return profile?.content?.picture || `https://robohash.org/${pubkey}`;
  };

  const getDisplayName = (pubkey: string) => {
    const profile = profileContext.profileData.get(pubkey);
    return profile?.content?.name || nip19.npubEncode(pubkey).slice(0, 8) + "...";
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Messages</h1>
          <Button
            color="primary"
            startContent={<ChatBubbleLeftIcon className="h-5 w-5" />}
            onPress={() => router.push("/orders")}
          >
            New Message
          </Button>
        </CardHeader>
        <Divider />
        <CardBody className="flex flex-row gap-4 p-0">
          {/* Chat List */}
          <div className="w-1/3 border-r border-gray-200 dark:border-gray-700">
            <ScrollShadow className="h-[600px]">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    selectedChat === chat.id ? "bg-gray-100 dark:bg-gray-800" : ""
                  }`}
                  onClick={() => setSelectedChat(chat.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={getProfilePicture(chat.pubkey)}
                      size="sm"
                    />
                    <div>
                      <p className="font-medium">{getDisplayName(chat.pubkey)}</p>
                      <p className="text-sm text-gray-500">
                        {chat.lastMessage?.slice(0, 30) || "No messages yet"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </ScrollShadow>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {selectedChat ? (
              <>
                <ScrollShadow className="flex-1 p-4">
                  {/* Messages will be rendered here */}
                  <div className="text-center text-gray-500">
                    Select a chat to start messaging
                  </div>
                </ScrollShadow>
                <Divider />
                <CardFooter className="p-4">
                  <div className="flex gap-2 w-full">
                    <Input
                      placeholder="Type a message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") handleSendMessage();
                      }}
                    />
                    <Button
                      isIconOnly
                      color="primary"
                      onPress={handleSendMessage}
                    >
                      <PaperAirplaneIcon className="h-5 w-5" />
                    </Button>
                  </div>
                </CardFooter>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <ChatBubbleLeftIcon className="h-12 w-12 mx-auto text-gray-400" />
                  <p className="mt-2 text-gray-500">Select a chat to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
} 