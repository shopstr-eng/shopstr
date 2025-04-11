import { useState, useEffect, useContext } from "react";
import { useForm, Controller } from "react-hook-form";
import Link from "next/link";
import {
  InformationCircleIcon,
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
  Radio,
  RadioGroup,
} from "@nextui-org/react";
import { Relay } from "nostr-tools";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  createNostrRelayEvent,
  getLocalStorageData,
  publishWalletEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { useTheme } from "next-themes";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import ShopstrSlider from "../../components/utility-components/shopstr-slider";
import FailureModal from "../../components/utility-components/failure-modal";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

const PreferencesPage = () => {
  const { nostr } = useContext(NostrContext);
  const [relays, setRelays] = useState(Array<string>(0));
  const [readRelays, setReadRelays] = useState(Array<string>(0));
  const [writeRelays, setWriteRelays] = useState(Array<string>(0));
  const [showRelayModal, setShowRelayModal] = useState(false);
  const [relaysAreChanged, setRelaysAreChanged] = useState(false);
  const [currentRelayType, setCurrentRelayType] = useState<
    "all" | "read" | "write" | ""
  >("");

  const [mints, setMints] = useState(Array<string>(0));
  const [showMintModal, setShowMintModal] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const { signer, pubkey } = useContext(SignerContext);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMints(getLocalStorageData().mints);
      setRelays(getLocalStorageData().relays);
      setReadRelays(getLocalStorageData().readRelays);
      setWriteRelays(getLocalStorageData().writeRelays);
    }
    setIsLoaded(true);
  }, [signer]);

  useEffect(() => {
    if (mints.length != 0) {
      localStorage.setItem("mints", JSON.stringify(mints));
    }
  }, [mints]);

  const { theme, setTheme } = useTheme();

  const {
    handleSubmit: handleMintSubmit,
    control: mintControl,
    reset: mintReset,
  } = useForm();

  const onMintSubmit = async (data: { [x: string]: string }) => {
    const mint = data["mint"];
    await replaceMint(mint!);
  };

  const handleToggleMintModal = () => {
    mintReset();
    setShowMintModal(!showMintModal);
  };

  const replaceMint = async (newMint: string) => {
    try {
      // Perform a fetch request to the specified mint URL
      const response = await fetch(newMint + "/keys");
      if (response.ok) {
        if (!mints.includes(newMint)) {
          setMints([newMint, ...mints]);
        } else {
          setMints([newMint, ...mints.filter((mint) => mint !== newMint)]);
        }
        await publishWalletEvent(nostr!, signer!);
        handleToggleMintModal();
      } else {
        setFailureText(
          `Failed to add mint! Could not fetch keys from ${newMint}/keys.`
        );
        setShowFailureModal(true);
      }
    } catch {
      setFailureText(
        `Failed to add mint! Could not fetch keys from ${newMint}/keys.`
      );
      setShowFailureModal(true);
    }
  };

  const deleteMint = async (mintToDelete: string) => {
    setMints(mints.filter((mint) => mint !== mintToDelete));
    await publishWalletEvent(nostr!, signer!);
  };

  useEffect(() => {
    if (relays.length != 0) {
      localStorage.setItem("relays", JSON.stringify(relays));
    }
    if (readRelays.length != 0) {
      localStorage.setItem("readRelays", JSON.stringify(readRelays));
    }
    if (writeRelays.length != 0) {
      localStorage.setItem("writeRelays", JSON.stringify(writeRelays));
    }
  }, [relays, readRelays, writeRelays]);

  const {
    handleSubmit: handleRelaySubmit,
    control: relayControl,
    reset: relayReset,
  } = useForm();

  const onRelaySubmit = async (data: { [x: string]: string }) => {
    const relay = data["relay"];
    await addRelay(relay!, currentRelayType);
  };

  const handleToggleRelayModal = (type: "all" | "read" | "write" | "") => {
    setCurrentRelayType(type);
    relayReset();
    setShowRelayModal(!showRelayModal);
  };

  const addRelay = async (
    newRelay: string,
    type: "all" | "read" | "write" | ""
  ) => {
    try {
      const relayTest = await Relay.connect(newRelay);
      if (type === "read") {
        setReadRelays([...readRelays, newRelay]);
      } else if (type === "write") {
        setWriteRelays([...writeRelays, newRelay]);
      } else if (type === "all") {
        setRelays([...relays, newRelay]);
      }
      relayTest.close();
      handleToggleRelayModal(type);
      setRelaysAreChanged(true);
    } catch {
      setFailureText(`Relay ${newRelay} was unable to connect!`);
      setShowFailureModal(true);
    }
  };

  const deleteRelay = (
    relayToDelete: string,
    type: "all" | "read" | "write" | ""
  ) => {
    if (type === "read") {
      setReadRelays(readRelays.filter((relay) => relay !== relayToDelete));
    } else if (type === "write") {
      setWriteRelays(writeRelays.filter((relay) => relay !== relayToDelete));
    } else if (type === "all") {
      setRelays(relays.filter((relay) => relay !== relayToDelete));
    }
    setRelaysAreChanged(true);
  };

  const publishRelays = () => {
    createNostrRelayEvent(nostr!, signer!, pubkey!);
    setRelaysAreChanged(false);
  };

  return (
    <>
      <div className="flex min-h-screen flex-col bg-light-bg pb-6 pt-24 dark:bg-dark-bg">
        <div className="mx-auto px-4">
          <SettingsBreadCrumbs />
          <span className="my-4 flex  text-2xl font-bold text-light-text dark:text-dark-text">
            Mint
          </span>

          <div>
            {mints.length === 0 && (
              <div className="mt-8 flex items-center justify-center">
                <p className="text-liht-text break-words text-center text-xl dark:text-dark-text">
                  No mint added . . .
                </p>
              </div>
            )}
            <div className="mt-4 max-h-96 overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
              {mints.map((mint, index) => (
                <div
                  key={mint}
                  className={`mb-2 flex items-center justify-between rounded-md border-2 ${
                    index === 0
                      ? "relative border-purple-500 dark:border-yellow-500"
                      : "border-light-fg dark:border-dark-fg"
                  } px-3 py-2`}
                >
                  <div className="max-w-xsm break-all text-light-text dark:text-dark-text ">
                    {mint}
                    {index === 0 && (
                      <span className="bg-light-bg px-3 text-xs text-gray-500 dark:bg-dark-bg">
                        Active Mint
                      </span>
                    )}
                  </div>
                  {mints.length > 1 && (
                    <MinusCircleIcon
                      onClick={() => deleteMint(mint)}
                      className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
                    />
                  )}
                </div>
              ))}
            </div>
            {mints.length > 0 && (
              <div className="mx-4 my-4 flex items-center justify-center text-center">
                <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
                <p className="ml-2 text-sm text-light-text dark:text-dark-text">
                  This mint is used to handle{" "}
                  <Link href="https://cashu.space" passHref legacyBehavior>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Cashu
                    </a>
                  </Link>{" "}
                  tokens within your wallet and to send to the seller upon
                  purchase.
                </p>
              </div>
            )}

            <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={handleToggleMintModal}
              >
                Change Active Mint
              </Button>
            </div>
            <Modal
              backdrop="blur"
              isOpen={showMintModal}
              onClose={handleToggleMintModal}
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
                  Change Active Mint
                </ModalHeader>
                <form onSubmit={handleMintSubmit(onMintSubmit)}>
                  <ModalBody>
                    <Controller
                      name="mint"
                      control={mintControl}
                      rules={{
                        required: "A mint URL is required.",
                        maxLength: {
                          value: 500,
                          message: "This input exceed maxLength of 500.",
                        },
                        validate: (value) =>
                          /^(https:\/\/|http:\/\/)/.test(value) ||
                          "Invalid mint URL, must start with https:// or http://.",
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
                          <Textarea
                            className="text-light-text dark:text-dark-text"
                            variant="bordered"
                            fullWidth={true}
                            placeholder="https://..."
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            // controller props
                            onChange={onChange} // send value to hook form
                            onBlur={onBlur} // notify when input is touched/blur
                            value={value}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleMintSubmit(onMintSubmit)();
                              }
                            }}
                          />
                        );
                      }}
                    />
                  </ModalBody>

                  <ModalFooter>
                    <Button
                      color="danger"
                      variant="light"
                      onClick={handleToggleMintModal}
                    >
                      Cancel
                    </Button>

                    <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                      Change Mint
                    </Button>
                  </ModalFooter>
                </form>
              </ModalContent>
            </Modal>
          </div>

          <span className="mt-4 flex text-2xl font-bold text-light-text dark:text-dark-text">
            Read/Write Relays
          </span>

          {relays.length === 0 && (
            <div className="mt-4 flex items-center justify-center">
              <p className="break-words text-center text-xl text-light-text dark:text-dark-text">
                No relays added . . .
              </p>
            </div>
          )}
          <div className="mt-4 max-h-96 overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
            {relays.map((relay) => (
              <div
                key={relay}
                className="mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg"
              >
                <div className="max-w-xsm break-all text-light-text dark:text-dark-text ">
                  {relay}
                </div>
                {relays.length > 1 && (
                  <MinusCircleIcon
                    onClick={() => deleteRelay(relay, "all")}
                    className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
              onClick={() => handleToggleRelayModal("all")}
            >
              Add Relay
            </Button>
            {relaysAreChanged && (
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={() => publishRelays()}
              >
                Save
              </Button>
            )}
          </div>
          <Modal
            backdrop="blur"
            isOpen={showRelayModal}
            onClose={() => handleToggleRelayModal("all")}
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
                Add Relay
              </ModalHeader>
              <form onSubmit={handleRelaySubmit(onRelaySubmit)}>
                <ModalBody>
                  <Controller
                    name="relay"
                    control={relayControl}
                    rules={{
                      required: "A relay URL is required.",
                      maxLength: {
                        value: 500,
                        message: "This input exceed maxLength of 500.",
                      },
                      validate: (value) =>
                        /^(wss:\/\/|ws:\/\/)/.test(value) ||
                        "Invalid relay URL, must start with wss:// or ws://.",
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
                        <Textarea
                          className="text-light-text dark:text-dark-text"
                          variant="bordered"
                          fullWidth={true}
                          placeholder="wss://..."
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          // controller props
                          onChange={onChange} // send value to hook form
                          onBlur={onBlur} // notify when input is touched/blur
                          value={value}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRelaySubmit(onRelaySubmit)();
                            }
                          }}
                        />
                      );
                    }}
                  />
                </ModalBody>

                <ModalFooter>
                  <Button
                    color="danger"
                    variant="light"
                    onClick={() => handleToggleRelayModal("")}
                  >
                    Cancel
                  </Button>

                  <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                    Add Relay
                  </Button>
                </ModalFooter>
              </form>
            </ModalContent>
          </Modal>

          <span className="mt-4 flex text-2xl font-bold text-light-text dark:text-dark-text">
            Read Only Relays
          </span>

          {readRelays.length === 0 && (
            <div className="mt-4 flex items-center justify-center">
              <p className="break-words text-center text-xl dark:text-dark-text">
                No relays added . . .
              </p>
            </div>
          )}
          <div className="mt-4 max-h-96 overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
            {readRelays.map((relay) => (
              <div
                key={relay}
                className="mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg"
              >
                <div className="max-w-xsm break-all text-light-text dark:text-dark-text ">
                  {relay}
                </div>
                {readRelays.length > 1 && (
                  <MinusCircleIcon
                    onClick={() => deleteRelay(relay, "read")}
                    className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
              onClick={() => handleToggleRelayModal("read")}
            >
              Add Relay
            </Button>
            {relaysAreChanged && (
              <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={() => publishRelays()}
                >
                  Save
                </Button>
              </div>
            )}
          </div>
          <Modal
            backdrop="blur"
            isOpen={showRelayModal}
            onClose={() => handleToggleRelayModal("read")}
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
                Add Relay
              </ModalHeader>
              <form onSubmit={handleRelaySubmit(onRelaySubmit)}>
                <ModalBody>
                  <Controller
                    name="relay"
                    control={relayControl}
                    rules={{
                      required: "A relay URL is required.",
                      maxLength: {
                        value: 500,
                        message: "This input exceed maxLength of 500.",
                      },
                      validate: (value) =>
                        /^(wss:\/\/|ws:\/\/)/.test(value) ||
                        "Invalid relay URL, must start with wss:// or ws://.",
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
                        <Textarea
                          className="text-light-text dark:text-dark-text"
                          variant="bordered"
                          fullWidth={true}
                          placeholder="wss://..."
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          // controller props
                          onChange={onChange} // send value to hook form
                          onBlur={onBlur} // notify when input is touched/blur
                          value={value}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRelaySubmit(onRelaySubmit)();
                            }
                          }}
                        />
                      );
                    }}
                  />
                </ModalBody>

                <ModalFooter>
                  <Button
                    color="danger"
                    variant="light"
                    onClick={() => handleToggleRelayModal("")}
                  >
                    Cancel
                  </Button>

                  <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                    Add Relay
                  </Button>
                </ModalFooter>
              </form>
            </ModalContent>
          </Modal>

          <span className="mt-4 flex text-2xl font-bold text-light-text dark:text-dark-text">
            Write Only Relays
          </span>

          {writeRelays.length === 0 && (
            <div className="mt-4 flex items-center justify-center">
              <p className="break-words text-center text-xl dark:text-dark-text">
                No relays added . . .
              </p>
            </div>
          )}
          <div className="mt-4 max-h-96 overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
            {writeRelays.map((relay) => (
              <div
                key={relay}
                className="mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg"
              >
                <div className="max-w-xsm break-all text-light-text dark:text-dark-text ">
                  {relay}
                </div>
                {writeRelays.length > 1 && (
                  <MinusCircleIcon
                    onClick={() => deleteRelay(relay, "write")}
                    className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
              onClick={() => handleToggleRelayModal("write")}
            >
              Add Relay
            </Button>
            {relaysAreChanged && (
              <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={() => publishRelays()}
                >
                  Save
                </Button>
              </div>
            )}
          </div>
          <Modal
            backdrop="blur"
            isOpen={showRelayModal}
            onClose={() => handleToggleRelayModal("write")}
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
                Add Relay
              </ModalHeader>
              <form onSubmit={handleRelaySubmit(onRelaySubmit)}>
                <ModalBody>
                  <Controller
                    name="relay"
                    control={relayControl}
                    rules={{
                      required: "A relay URL is required.",
                      maxLength: {
                        value: 500,
                        message: "This input exceed maxLength of 500.",
                      },
                      validate: (value) =>
                        /^(wss:\/\/|ws:\/\/)/.test(value) ||
                        "Invalid relay URL, must start with wss:// or ws://.",
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
                        <Textarea
                          className="text-light-text dark:text-dark-text"
                          variant="bordered"
                          fullWidth={true}
                          placeholder="wss://..."
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          // controller props
                          onChange={onChange} // send value to hook form
                          onBlur={onBlur} // notify when input is touched/blur
                          value={value}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRelaySubmit(onRelaySubmit)();
                            }
                          }}
                        />
                      );
                    }}
                  />
                </ModalBody>

                <ModalFooter>
                  <Button
                    color="danger"
                    variant="light"
                    onClick={() => handleToggleRelayModal("")}
                  >
                    Cancel
                  </Button>

                  <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                    Add Relay
                  </Button>
                </ModalFooter>
              </form>
            </ModalContent>
          </Modal>

          <span className="my-4 flex  text-2xl font-bold text-light-text dark:text-dark-text">
            Web of Trust
          </span>

          {isLoaded && (
            <>
              <ShopstrSlider />
            </>
          )}

          <div className="mx-4 my-4 flex items-center justify-center text-center">
            <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
            <p className="ml-2 text-sm text-light-text dark:text-dark-text">
              This filters for listings from friends and friends of friends.
            </p>
          </div>

          <span className="my-4 flex text-2xl font-bold text-light-text dark:text-dark-text">
            Theme
          </span>
          {isLoaded && (
            <RadioGroup
              className="ml-2"
              label="Select your prefered theme:"
              orientation={"horizontal"}
              defaultValue={
                (localStorage.getItem("theme") as string) || theme || "system"
              }
              onChange={(e) => {
                localStorage.setItem("theme", e.target.value);
                setTheme(e.target.value);
              }}
            >
              <Radio value="system" className="mr-4">
                System
              </Radio>
              <Radio value="light" className="mx-4">
                Light
              </Radio>
              <Radio value="dark" className="mx-4">
                Dark
              </Radio>
            </RadioGroup>
          )}
        </div>
      </div>
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </>
  );
};

export default PreferencesPage;
