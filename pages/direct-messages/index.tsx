import { useMemo, useState, useEffect, useRef, useContext, use } from "react";
import { useForm, Controller } from "react-hook-form";
import axios from "axios";
import { nip04, nip19, SimplePool } from "nostr-tools";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Input,
  ModalFooter,
  Textarea,
} from "@nextui-org/react";
import { useRouter } from "next/router";
import {
  LocalStorageInterface,
  decryptNpub,
  getLocalStorageData,
  getNsecWithPassphrase,
  getPrivKeyWithPassphrase,
  validPassphrase,
} from "../components/utility/nostr-helper-functions";
import { ProfileAvatar } from "../components/utility-components/avatar";
import { ProfileMapContext, ChatsContext } from "../context";
import { SHOPSTRBUTTONCLASSNAMES } from "../components/utility/STATIC-VARIABLES";
import RequestPassphraseModal from "../components/utility-components/request-passphrase-modal";
import {
  ArrowUturnLeftIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import { encrypt } from "nostr-tools/lib/types/nip04";

const DirectMessages = () => {
  const router = useRouter();
  const chatsContext = useContext(ChatsContext);

  const [chatsMap, setChatsMap] = useState(new Map());
  const [chats, setChats] = useState([]);
  const [currentChat, setCurrentChat] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [thisChat, setThisChat] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [localStorageValues, setLocalStorageValues] =
    useState<LocalStorageInterface>(getLocalStorageData());

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    async function loadChats() {
      if (!chatsContext) return;
      setIsLoading(chatsContext.isLoading);
      if (
        localStorageValues.signIn === "nsec" &&
        !validPassphrase(passphrase)
      ) {
        setEnterPassphrase(true); // prompt for passphrase when chatsContext is loaded
      } else if (!chatsContext.isLoading && chatsContext.chats) {
        // comes here only if signIn is extension or its nsec and passphrase is valid
        let decryptedChats = await decryptChats();
        console.log("decryptedChats", decryptedChats);
        setChatsMap(decryptedChats);
        return;
      }
    }
    loadChats();
  }, [chatsContext, passphrase]);

  const bottomDivRef = useRef();

  // useEffect(() => {
  //   bottomDivRef.current?.scrollIntoView({ behavior: "smooth" });
  // }, [messages]);

  const decryptChats = async () => {
    let decryptedChats = new Map();
    for (let [chatPubkey, chat] of chatsContext.chats) {
      let decryptedChat = [];
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

  const {
    handleSubmit,
    formState: { errors },
    control,
    reset,
  } = useForm();

  const isButtonDisabled = useMemo(() => {
    if (localStorageValues.signIn === "extension") return false; // extension can upload without passphrase
    if (passphrase === "") return true; // nsec needs passphrase
    try {
      let nsec = getNsecWithPassphrase(passphrase);
      if (!nsec) return true; // invalid passphrase
    } catch (e) {
      return true; // invalid passphrase
    }
    return false;
  }, [localStorageValues.signIn, passphrase]);

  const buttonClassName = useMemo(() => {
    const disabledStyle = " from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = " from-purple-600 via-purple-500 to-purple-600";
    const className =
      "text-white shadow-lg bg-gradient-to-tr" +
      (isButtonDisabled ? disabledStyle : enabledStyle);
    return className;
  }, [isButtonDisabled]);

  const passphraseInputRef = useRef(null);

  const onSubmit = async (data) => {
    let npub = data["npub"];
    await handleEnterNewChat(npub);
  };

  const cancel = () => {
    setEnterPassphrase(false);
    setPassphrase("");
  };

  const handleToggleModal = () => {
    if (localStorageValues.signIn) {
      reset();
      setPassphrase("");
      setShowModal(!showModal);
    } else {
      alert("You must be signed in to start a chat!");
    }
  };

  const handleGoBack = () => {
    setCurrentChat("");
    router.push("/direct-messages");
  };

  const handleEnterNewChat = (newNpub: string) => {
    if (localStorageValues.signIn != "extension") {
      if (!chats.includes(newNpub)) {
        let newChats = Array.from(new Set([...chats, newNpub]));
        setChats(newChats);
      }
      setCurrentChat(newNpub);
      setShowModal(!showModal);
    } else {
      if (!chats.includes(newNpub)) {
        let newChats = Array.from(new Set([...chats, newNpub]));
        setChats(newChats);
      }
      setCurrentChat(newNpub);
      setShowModal(!showModal);
    }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
  };

  console.log("localStorageValues.signIn", localStorageValues.signIn);
  const handleSend = async (e) => {
    e.preventDefault();
    if (message.trim() !== "") {
      if (localStorageValues.signIn === "extension") {
        const { data } = nip19.decode(currentChat);
        const event = {
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [["p", data]],
          content: await window.nostr.nip04.encrypt(data, message),
        };

        const signedEvent = await window.nostr.signEvent(event);

        const pool = new SimplePool();

        // const relays = JSON.parse(storedRelays);

        await Promise.any(pool.publish(relays, signedEvent));
      } else {
        let privkey = getPrivKeyWithPassphrase(passphrase);
        // request passphrase in popup or form and pass to api

        let { data: chatPubkey } = nip19.decode(currentChat);

        axios({
          method: "POST",
          url: "/api/nostr/post-event",
          headers: {
            "Content-Type": "application/json",
          },
          data: {
            pubkey: decryptedNpub,
            privkey: privkey,
            created_at: Math.floor(Date.now() / 1000),
            kind: 4,
            tags: [["p", chatPubkey]],
            content: message,
            relays: relays,
          },
        });
      }
      setMessage("");
    }
  };

  const handlePassphraseChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "passphrase") {
      setPassphrase(value);
    }
  };

  const handleClickChat = (chat: string) => {
    setCurrentChat(chat);
  };

  const handleEnterPassphrase = (chat: string) => {
    setEnterPassphrase(true);
    setThisChat(chat);
  };

  const handleSubmitPassphrase = () => {
    if (getNsecWithPassphrase(passphrase)) {
      setEnterPassphrase(false);
      setCurrentChat(thisChat);
    } else {
      alert("Invalid passphrase!");
    }
  };

  const deleteChat = (chatToDelete) => {
    setChats(chats.filter((chat) => chat !== chatToDelete));
  };

  if (!currentChat) {
    return (
      <div>
        {chatsMap.size === 0 ? (
          <div className="mt-8 flex items-center justify-center">
            <p
              className="break-words text-center text-xl dark:text-dark-text"
              suppressHydrationWarning
            >
              {isClient && localStorageValues.decryptedNpub ? (
                <>
                  No messages . . . yet!
                  <br></br>
                  If you've just logged in, try to reload the page
                </>
              ) : (
                <>You must be signed in to see your chats!</>
              )}
            </p>
          </div>
        ) : (
          <div className="mb-8 h-[75vh] overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
            {Array.from(chatsMap.entries()).map(([pubkeyOfChat, messages]) => {
              return (
                <div
                  key={pubkeyOfChat}
                  className="mx-3 mb-2 grid cursor-pointer grid-cols-5 items-center gap-4 rounded-md border-2 border-light-fg px-3 py-2 hover:opacity-70 dark:border-dark-fg"
                  onClick={() => handleClickChat(pubkeyOfChat)}
                >
                  <div className="col-span-3 overflow-clip">
                    <ProfileAvatar pubkey={pubkeyOfChat} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button className=" text-light-text dark:text-dark-text">
                      Enter Chat
                    </button>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <MinusCircleIcon
                      onClick={() => deleteChat(pubkeyOfChat)}
                      className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="absolute bottom-[0px] z-20 flex h-fit w-[99vw] flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
          <Button
            // className="mx-3 bg-gradient-to-tr from-purple-600 via-purple-500 to-purple-600 shadow-lg"
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={handleToggleModal}
          >
            Start New Chat
          </Button>
        </div>
        <Modal
          backdrop="blur"
          isOpen={showModal}
          onClose={handleToggleModal}
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
              Start New Chat
            </ModalHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <ModalBody>
                <Controller
                  name="npub"
                  control={control}
                  rules={{
                    required: "An npub is required.",
                    maxLength: {
                      value: 300,
                      message: "This input exceed maxLength of 300.",
                    },
                    validate: (value) =>
                      /^npub[a-zA-Z0-9]{59}$/.test(value) || "Invalid npub.",
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
                        variant="bordered"
                        fullWidth={true}
                        placeholder="npub..."
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
                  onClick={handleToggleModal}
                >
                  Cancel
                </Button>

                <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                  Enter Chat
                </Button>
              </ModalFooter>
            </form>
          </ModalContent>
        </Modal>
        <RequestPassphraseModal
          passphrase={passphrase}
          setCorrectPassphrase={setPassphrase}
          isOpen={enterPassphrase}
          setIsOpen={setEnterPassphrase}
          actionOnSubmit={handleSubmitPassphrase}
        />
      </div>
    );
  }
  return (
    <div>
      <h2
        className="mt-2 flex w-fit cursor-pointer flex-row items-center rounded-md pr-2 align-middle text-shopstr-purple-light hover:bg-shopstr-yellow dark:text-shopstr-yellow-light hover:dark:bg-shopstr-purple"
        onClick={handleGoBack}
      >
        <ArrowUturnLeftIcon className="h-5 w-5 text-shopstr-purple-light hover:text-purple-700 dark:text-shopstr-yellow-light" />
        {currentChat}
      </h2>
      <div className="my-2 max-h-[70vh] overflow-y-scroll rounded-md border-2 border-light-fg bg-light-fg dark:border-dark-fg dark:bg-dark-fg">
        {chatsMap.get(currentChat).map((messageEvent, index) => {
          return (
            <div
              key={index}
              className={`my-2 flex ${
                messageEvent.pubkey === localStorageValues.decryptedNpub
                  ? "justify-end"
                  : messageEvent.pubkey === currentChat
                    ? "justify-start"
                    : ""
              }`}
            >
              <p
                className={`inline-block max-w-[100vh] break-words rounded-lg p-3 ${
                  messageEvent.pubkey === localStorageValues.decryptedNpub
                    ? "bg-purple-200"
                    : "bg-gray-300"
                }`}
              >
                {messageEvent.content}
              </p>
            </div>
          );
        })}
        <div ref={bottomDivRef} />
      </div>
      <form className="flex items-center space-x-2" onSubmit={handleSend}>
        <Input
          className="text-light-text dark:text-dark-text"
          type="text"
          width="100%"
          size="large"
          value={message}
          placeholder="Type your message..."
          onChange={handleChange}
        />
        <Button type="submit" className={SHOPSTRBUTTONCLASSNAMES}>
          Send
        </Button>
      </form>
    </div>
  );
};

export default DirectMessages;
