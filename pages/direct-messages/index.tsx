import { useMemo, useState, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import axios from "axios";
import { nip04, nip19, SimplePool } from "nostr-tools";
import {
  ArrowUturnLeftIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Input,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";
import * as CryptoJS from "crypto-js";
import { useRouter } from "next/router";
import {
  getNsecWithPassphrase,
  getPrivKeyWithPassphrase,
} from "../nostr-helpers";

const DirectMessages = () => {
  const router = useRouter();

  const [decryptedNpub, setDecryptedNpub] = useState("");
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState("");
  const [signIn, setSignIn] = useState("");
  const [relays, setRelays] = useState([]);

  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentChat, setCurrentChat] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");

  const [enterPassphrase, setEnterPassphrase] = useState(null);
  const [passphrase, setPassphrase] = useState("");

  const [thisChat, setThisChat] = useState("");

  const bottomDivRef = useRef();

  useEffect(() => {
    bottomDivRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const npub = localStorage.getItem("npub");
      const { data } = nip19.decode(npub);
      setDecryptedNpub(data);
      const encrypted = localStorage.getItem("encryptedPrivateKey");
      setEncryptedPrivateKey(encrypted);
      const signIn = localStorage.getItem("signIn");
      setSignIn(signIn);
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
  }, []);

  useEffect(() => {
    if (relays && signIn != "") {
      const passedPubkey = router.query.pk ? router.query.pk : null;
      if (passedPubkey) {
        if (signIn === "nsec") {
          let passedPubkeyStr = passedPubkey.toString();
          setThisChat(passedPubkeyStr);
          if (!chats.includes(passedPubkeyStr)) {
            let newChats = Array.from(new Set([...chats, passedPubkeyStr]));
            setChats(newChats);
          }
          setEnterPassphrase(true);
          if (getNsecWithPassphrase(passphrase)) {
            let newChats = Array.from(new Set([...chats, passedPubkeyStr]));
            setChats(newChats);
          }
        } else {
          let passedPubkeyStr = passedPubkey.toString();
          setThisChat(passedPubkeyStr);
          if (!chats.includes(passedPubkeyStr)) {
            let newChats = Array.from(new Set([...chats, passedPubkeyStr]));
            setChats(newChats);
          }
          let newChats = Array.from(new Set([...chats, passedPubkeyStr]));
          setChats(newChats);
        }
      }

      const pool = new SimplePool();

      const validNpub = /^npub[a-zA-Z0-9]{59}$/;

      let subParams: { kinds: number[]; authors?: string[] } = {
        kinds: [4],
      };

      let newNip04Sub = pool.sub(relays, [subParams]);

      newNip04Sub.on("event", (event) => {
        let tagPubkey = event.tags[0][1];
        let incomingPubkey = event.pubkey;

        if (decryptedNpub === tagPubkey) {
          if (!validNpub.test(incomingPubkey)) {
            if (!chats.includes(incomingPubkey)) {
              setChats((chats) => {
                return Array.from(
                  new Set([...chats, nip19.npubEncode(incomingPubkey)]),
                );
              });
            }
          } else {
            if (!chats.includes(incomingPubkey)) {
              setChats((chats) => {
                return Array.from(new Set([...chats, incomingPubkey]));
              });
            }
          }
        } else if (decryptedNpub === incomingPubkey) {
          if (!validNpub.test(tagPubkey)) {
            if (!chats.includes(tagPubkey)) {
              setChats((chats) => {
                return Array.from(
                  new Set([...chats, nip19.npubEncode(tagPubkey)]),
                );
              });
            }
          } else {
            if (!chats.includes(tagPubkey)) {
              setChats((chats) => {
                return Array.from(new Set([...chats, tagPubkey]));
              });
            }
          }
        }
      });
    }
  }, [relays, signIn]);

  useEffect(() => {
    const pool = new SimplePool();
    setMessages([]);

    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [4],
    };

    if (currentChat) {
      let { data: chatPubkey } = nip19.decode(currentChat);

      subParams["authors"] = [decryptedNpub, chatPubkey];

      let nip04Sub = pool.sub(relays, [subParams]);

      nip04Sub.on("event", async (event) => {
        let sender = event.pubkey;

        let tagPubkey = event.tags[0][1];

        let plaintext;
        if (
          (decryptedNpub === sender && tagPubkey === chatPubkey) ||
          (chatPubkey === sender && tagPubkey === decryptedNpub)
        ) {
          if (signIn === "extension") {
            plaintext = await window.nostr.nip04.decrypt(
              chatPubkey,
              event.content,
            );
          } else {
            let sk2 = getPrivKeyWithPassphrase(passphrase);
            plaintext = await nip04.decrypt(sk2, chatPubkey, event.content);
          }
        }
        let created_at = event.created_at;

        if (plaintext != undefined) {
          // Get an array of all existing event IDs
          let existingEventIds = messages.map((message) => message.eventId);
          // Only add this message if its eventId is not already in existingEventIds
          if (!existingEventIds.includes(event.id)) {
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                plaintext: plaintext,
                createdAt: created_at,
                sender: sender,
                eventId: event.id,
              },
            ]);
          }
          // Sort the messages with each state update
          setMessages((prevMessages) =>
            prevMessages.sort((a, b) => a.createdAt - b.createdAt),
          );
        }
      });
    }
  }, [currentChat]);

  useEffect(() => {
    localStorage.setItem("chats", JSON.stringify(chats));
  }, [chats]);

  const {
    handleSubmit,
    formState: { errors },
    control,
    reset,
  } = useForm();

  const isButtonDisabled = useMemo(() => {
    if (signIn === "extension") return false; // extension can upload without passphrase
    if (passphrase === "") return true; // nsec needs passphrase
    try {
      let nsec = getNsecWithPassphrase(passphrase);
      if (!nsec) return true; // invalid passphrase
    } catch (e) {
      return true; // invalid passphrase
    }
    return false;
  }, [signIn, passphrase]);

  const buttonClassName = useMemo(() => {
    const disabledStyle = " from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = " from-purple-600 via-purple-500 to-purple-600";
    const className =
      "text-white shadow-lg bg-gradient-to-tr" +
      (isButtonDisabled ? disabledStyle : enabledStyle);
    return className;
  }, [isButtonDisabled]);

  const passphraseInputRef = useRef(null);

  const confirmActionDropdown = (children, header, label, func) => {
    return (
      <Dropdown backdrop="blur">
        <DropdownTrigger>{children}</DropdownTrigger>
        <DropdownMenu variant="faded" aria-label="Static Actions">
          <DropdownSection title={header} showDivider={true}></DropdownSection>
          <DropdownItem
            key="delete"
            className="text-danger"
            color="danger"
            onClick={func}
          >
            {label}
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    );
  };

  const onSubmit = async (data) => {
    let npub = data["npub"];
    await handleEnterNewChat(npub);
  };

  const cancel = () => {
    setEnterPassphrase(false);
    setPassphrase("");
  };

  const handleToggleModal = () => {
    reset();
    setPassphrase;
    setShowModal(!showModal);
  };

  const handleGoBack = () => {
    setCurrentChat(false);
    router.push("/direct-messages");
  };

  const handleEnterNewChat = (newNpub: string) => {
    if (signIn != "extension") {
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

  const handleSend = async (e) => {
    e.preventDefault();
    if (message.trim() !== "") {
      if (signIn === "extension") {
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

        await pool.publish(relays, signedEvent);

        let events = await pool.list(relays, [
          { kinds: [0, signedEvent.kind] },
        ]);
        let postedEvent = await pool.get(relays, {
          ids: [signedEvent.id],
        });
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

  const signInCheck = (chat: string) => {
    if (signIn != "extension") {
      handleEnterPassphrase(chat);
    } else {
      setCurrentChat(chat);
    }
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
        {chats.length === 0 && (
          <div className="mt-8 flex items-center justify-center">
            <p className="text-xl text-yellow-100 break-words text-center">
              No messages . . . yet!
            </p>
          </div>
        )}
        <div className="mt-8 mb-8 overflow-y-scroll max-h-[70vh] bg-white rounded-md">
          {chats.map((chat) => (
            <div key={chat} className="flex justify-between items-center mb-2">
              <div className="max-w-xsm truncate">{chat}</div>
              <button onClick={() => signInCheck(chat)}>Enter Chat</button>
              <MinusCircleIcon
                onClick={() => deleteChat(chat)}
                className="w-5 h-5 text-red-500 hover:text-yellow-700 cursor-pointer"
              />
            </div>
          ))}
        </div>
        <button
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
          onClick={handleToggleModal}
        >
          Start New Chat
        </button>
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
            <ModalHeader className="flex flex-col gap-1">
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
                {signIn === "nsec" && (
                  <Input
                    autoFocus
                    ref={passphraseInputRef}
                    variant="flat"
                    label="Passphrase"
                    labelPlacement="inside"
                    onChange={(e) => setPassphrase(e.target.value)}
                    value={passphrase}
                  />
                )}
              </ModalBody>

              <ModalFooter>
                {confirmActionDropdown(
                  <Button color="danger" variant="light">
                    Cancel
                  </Button>,
                  "Are you sure you want to cancel?",
                  "Cancel",
                  handleToggleModal,
                )}

                <Button
                  className={buttonClassName}
                  type="submit"
                  onClick={(e) => {
                    if (
                      isButtonDisabled &&
                      signIn === "nsec" &&
                      passphraseInputRef.current
                    ) {
                      e.preventDefault();
                      passphraseInputRef.current.focus();
                    }
                  }}
                >
                  Enter Chat
                </Button>
              </ModalFooter>
            </form>
          </ModalContent>
        </Modal>
        <Modal
          backdrop="blur"
          isOpen={enterPassphrase}
          onClose={() => handleEnterPassphrase("")}
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
            <ModalHeader className="flex flex-col gap-1">
              Enter Passphrase
            </ModalHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitPassphrase();
              }}
            >
              <ModalBody>
                {signIn === "nsec" && (
                  <Input
                    autoFocus
                    ref={passphraseInputRef}
                    variant="flat"
                    label="Passphrase"
                    labelPlacement="inside"
                    onChange={(e) => setPassphrase(e.target.value)}
                    value={passphrase}
                  />
                )}
              </ModalBody>

              <ModalFooter>
                {confirmActionDropdown(
                  <Button color="danger" variant="light">
                    Cancel
                  </Button>,
                  "Are you sure you want to cancel?",
                  "Cancel",
                  cancel,
                )}

                <Button
                  className={buttonClassName}
                  type="submit"
                  onClick={(e) => {
                    if (
                      isButtonDisabled &&
                      signIn === "nsec" &&
                      passphraseInputRef.current
                    ) {
                      e.preventDefault();
                      passphraseInputRef.current.focus();
                    }
                  }}
                >
                  Submit
                </Button>
              </ModalFooter>
            </form>
          </ModalContent>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <h2 className="flex flex-row items-center w-fit pr-2 align-middle text-yellow-500 hover:bg-purple-600 rounded-md cursor-pointer">
        <ArrowUturnLeftIcon
          className="w-5 h-5 text-yellow-100 hover:text-purple-700"
          onClick={handleGoBack}
        >
          Go Back
        </ArrowUturnLeftIcon>
        {currentChat}
      </h2>
      <div className="mt-8 mb-8 overflow-y-scroll max-h-[70vh] bg-white rounded-md">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`my-2 flex ${
              message.sender === decryptedNpub
                ? "justify-end"
                : message.sender === currentChat
                ? "justify-start"
                : ""
            }`}
          >
            <p
              className={`inline-block p-3 rounded-lg max-w-[100vh] break-words ${
                message.sender === decryptedNpub
                  ? "bg-purple-200"
                  : "bg-gray-300"
              }`}
            >
              {message.sender === decryptedNpub &&
              message.plaintext.includes("cashuA") ? (
                <i>Payment sent!</i>
              ) : (
                message.plaintext
              )}
            </p>
          </div>
        ))}
        <div ref={bottomDivRef} />
      </div>
      <form className="flex items-center" onSubmit={handleSend}>
        <input
          type="text"
          className="rounded-md py-1 px-2 mr-2 bg-gray-200 focus:outline-none focus:bg-white flex-grow"
          placeholder="Type your message..."
          value={message}
          onChange={handleChange}
        />
        <button
          type="submit"
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold rounded-md py-1 px-2"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default DirectMessages;
