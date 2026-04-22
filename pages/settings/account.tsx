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
} from "@heroui/react";
import { Relay } from "nostr-tools";
import {
  BLACKBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  createBlossomServerEvent,
  createNostrRelayEvent,
  getLocalStorageData,
  publishWalletEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import MilkMarketSlider from "@/components/utility-components/mm-slider";
import FailureModal from "@/components/utility-components/failure-modal";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import ProtectedRoute from "@/components/utility-components/protected-route";
import NostrKeysSection from "@/components/settings/nostr-keys-section";
import NWCSection from "@/components/settings/nwc-section";

const AccountSettingsPage = () => {
  const { nostr } = useContext(NostrContext);
  const { signer } = useContext(SignerContext);

  const [relays, setRelays] = useState(Array<string>(0));
  const [readRelays, setReadRelays] = useState(Array<string>(0));
  const [writeRelays, setWriteRelays] = useState(Array<string>(0));
  const [showRelayModal, setShowRelayModal] = useState(false);
  const [relaysAreChanged, setRelaysAreChanged] = useState(false);
  const [currentRelayType, setCurrentRelayType] = useState<
    "all" | "read" | "write" | ""
  >("");

  const [blossomServers, setBlossomServers] = useState(Array<string>(0));
  const [blossomServersAreChanged, setBlossomServersAreChanged] =
    useState(false);
  const [showBlossomServerModal, setShowBlossomServerModal] = useState(false);

  const [mints, setMints] = useState(Array<string>(0));
  const [showMintModal, setShowMintModal] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMints(getLocalStorageData().mints);
      setRelays(getLocalStorageData().relays);
      setReadRelays(getLocalStorageData().readRelays);
      setWriteRelays(getLocalStorageData().writeRelays);
      setBlossomServers(getLocalStorageData().blossomServers);
    }
    setIsLoaded(true);
  }, [signer]);

  useEffect(() => {
    if (mints.length != 0) {
      localStorage.setItem("mints", JSON.stringify(mints));
    }
  }, [mints]);

  useEffect(() => {
    if (blossomServers.length != 0) {
      localStorage.setItem("blossomServers", JSON.stringify(blossomServers));
    }
  }, [blossomServers]);

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

  const {
    handleSubmit: handleBlossomSubmit,
    control: blossomControl,
    reset: blossomReset,
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
      if (!relays.includes(newRelay)) {
        if (type === "read") {
          setReadRelays([...readRelays, newRelay]);
        } else if (type === "write") {
          setWriteRelays([...writeRelays, newRelay]);
        } else if (type === "all") {
          setRelays([...relays, newRelay]);
        }
      }
      relayTest.close();
      handleToggleRelayModal(type);
      setRelaysAreChanged(true);
    } catch {
      setFailureText(`${newRelay} was unable to connect!`);
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
    createNostrRelayEvent(nostr!, signer!);
    setRelaysAreChanged(false);
  };

  const handleToggleBlossomServerModal = () => {
    blossomReset();
    setShowBlossomServerModal(!showBlossomServerModal);
  };

  const onBlossomSubmit = async (data: { [x: string]: string }) => {
    const server = data["server"];
    await addBlossomServer(server!);
  };

  const addBlossomServer = async (newServer: string) => {
    try {
      const url = new URL("/upload", newServer);
      const checkResponse = await fetch(url);
      if (checkResponse.status === 404) {
        throw new Error(
          `Failed to add Blossom server! ${newServer} was unable to connect.`
        );
      }

      if (!blossomServers.includes(newServer)) {
        setBlossomServers([newServer, ...blossomServers]);
      } else {
        setBlossomServers([
          newServer,
          ...blossomServers.filter((server) => server !== newServer),
        ]);
      }
      handleToggleBlossomServerModal();
      setBlossomServersAreChanged(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setFailureText(errorMessage);
      setShowFailureModal(true);
    }
  };

  const deleteBlossomServer = (serverToDelete: string) => {
    setBlossomServers(
      blossomServers.filter((server) => server !== serverToDelete)
    );
    setBlossomServersAreChanged(true);
  };

  const publishBlossomServers = () => {
    createBlossomServerEvent(nostr!, signer!);
    setBlossomServersAreChanged(false);
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-white pt-24 pb-20">
        <div className="mx-auto w-full min-w-0 px-4 lg:w-1/2 xl:w-2/5">
          <SettingsBreadCrumbs />

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-black">
              Account Settings &amp; Preferences
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Back up your account, manage your payment settings, and configure
              your data storage.
            </p>
          </div>

          {/* Nostr Keys + Recovery */}
          <NostrKeysSection />

          {/* Mint Section */}
          <div className="mb-8">
            <h2 className="mb-4 text-2xl font-bold">Mint</h2>

            {mints.length === 0 ? (
              <p className="mb-4 text-gray-500">No mint added...</p>
            ) : (
              <div className="mb-4 space-y-2">
                {mints.map((mint, index) => (
                  <div
                    key={mint}
                    className="flex items-center justify-between rounded-lg border-3 border-black bg-white px-4 py-3"
                  >
                    <div className="flex-1 text-sm break-all">
                      {mint}
                      {index === 0 && (
                        <span className="ml-2 text-xs text-gray-500">
                          Active Mint
                        </span>
                      )}
                    </div>
                    {mints.length > 1 && (
                      <button
                        onClick={() => deleteMint(mint)}
                        className="ml-2 rounded p-1 hover:bg-gray-100"
                      >
                        <MinusCircleIcon className="h-5 w-5 text-black" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4 flex items-start gap-2 text-sm text-gray-600">
              <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p>
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

            <Button
              className={BLUEBUTTONCLASSNAMES}
              onClick={handleToggleMintModal}
            >
              Change Active Mint
            </Button>
          </div>

          {/* Nostr Wallet Connect */}
          <NWCSection />

          {/* Read/Write Relays Section */}
          <div className="mb-8">
            <h2 className="mb-4 text-2xl font-bold">Read/Write Relays</h2>

            {relays.length === 0 ? (
              <p className="mb-4 text-gray-500">No relays added...</p>
            ) : (
              <div className="mb-4 space-y-2">
                {relays.map((relay) => (
                  <div
                    key={relay}
                    className="flex items-center justify-between rounded-lg border-3 border-black bg-white px-4 py-3"
                  >
                    <div className="flex-1 text-sm break-all">{relay}</div>
                    {relays.length > 1 && (
                      <button
                        onClick={() => deleteRelay(relay, "all")}
                        className="ml-2 rounded p-1 hover:bg-gray-100"
                      >
                        <MinusCircleIcon className="h-5 w-5 text-black" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={() => handleToggleRelayModal("all")}
              >
                Add Relay
              </Button>
              {relaysAreChanged && (
                <Button
                  className={BLACKBUTTONCLASSNAMES}
                  onClick={() => publishRelays()}
                >
                  Save
                </Button>
              )}
            </div>
          </div>

          {/* Read Only Relays Section */}
          <div className="mb-8">
            <h2 className="mb-4 text-2xl font-bold">Read Only Relays</h2>

            {readRelays.length === 0 ? (
              <p className="mb-4 text-gray-500">No relays added...</p>
            ) : (
              <div className="mb-4 space-y-2">
                {readRelays.map((relay) => (
                  <div
                    key={relay}
                    className="flex items-center justify-between rounded-lg border-3 border-black bg-white px-4 py-3"
                  >
                    <div className="flex-1 text-sm break-all">{relay}</div>
                    {readRelays.length > 1 && (
                      <button
                        onClick={() => deleteRelay(relay, "read")}
                        className="ml-2 rounded p-1 hover:bg-gray-100"
                      >
                        <MinusCircleIcon className="h-5 w-5 text-black" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={() => handleToggleRelayModal("read")}
              >
                Add Relay
              </Button>
              {relaysAreChanged && (
                <Button
                  className={BLACKBUTTONCLASSNAMES}
                  onClick={() => publishRelays()}
                >
                  Save
                </Button>
              )}
            </div>
          </div>

          {/* Write Only Relays Section */}
          <div className="mb-8">
            <h2 className="mb-4 text-2xl font-bold">Write Only Relays</h2>

            {writeRelays.length === 0 ? (
              <p className="mb-4 text-gray-500">No relays added...</p>
            ) : (
              <div className="mb-4 space-y-2">
                {writeRelays.map((relay) => (
                  <div
                    key={relay}
                    className="flex items-center justify-between rounded-lg border-3 border-black bg-white px-4 py-3"
                  >
                    <div className="flex-1 text-sm break-all">{relay}</div>
                    {writeRelays.length > 1 && (
                      <button
                        onClick={() => deleteRelay(relay, "write")}
                        className="ml-2 rounded p-1 hover:bg-gray-100"
                      >
                        <MinusCircleIcon className="h-5 w-5 text-black" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={() => handleToggleRelayModal("write")}
              >
                Add Relay
              </Button>
              {relaysAreChanged && (
                <Button
                  className={BLACKBUTTONCLASSNAMES}
                  onClick={() => publishRelays()}
                >
                  Save
                </Button>
              )}
            </div>
          </div>

          {/* Blossom Media Servers Section */}
          <div className="mb-8">
            <h2 className="mb-4 text-2xl font-bold">Blossom Media Servers</h2>

            {blossomServers.length === 0 ? (
              <p className="mb-4 text-gray-500">No servers added...</p>
            ) : (
              <div className="mb-4 space-y-2">
                {blossomServers.map((server, index) => (
                  <div
                    key={server}
                    className="flex items-center justify-between rounded-lg border-3 border-black bg-white px-4 py-3"
                  >
                    <div className="flex-1 text-sm break-all">
                      {server}
                      {index === 0 && (
                        <span className="ml-2 text-xs text-gray-500">
                          Primary Server
                        </span>
                      )}
                    </div>
                    {blossomServers.length > 1 && (
                      <button
                        onClick={() => deleteBlossomServer(server)}
                        className="ml-2 rounded p-1 hover:bg-gray-100"
                      >
                        <MinusCircleIcon className="h-5 w-5 text-black" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={() => handleToggleBlossomServerModal()}
              >
                Add Server
              </Button>
              {blossomServersAreChanged && (
                <Button
                  className={BLACKBUTTONCLASSNAMES}
                  onClick={() => publishBlossomServers()}
                >
                  Save
                </Button>
              )}
            </div>
          </div>

          {/* Web of Trust Section */}
          <div className="mb-8">
            <h2 className="mb-4 text-2xl font-bold">Web of Trust</h2>

            {isLoaded && (
              <>
                <MilkMarketSlider />
              </>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <InformationCircleIcon className="h-5 w-5 flex-shrink-0" />
              <p>
                This filters for listings from friends and friends of friends.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mint Modal */}
      <Modal
        backdrop="blur"
        isOpen={showMintModal}
        onClose={handleToggleMintModal}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          header: "border-b-3 border-black bg-white rounded-t-xl",
          footer: "border-t-3 border-black bg-white rounded-b-xl",
          base: "border-3 border-black rounded-xl",
          closeButton: "hover:bg-gray-100 active:bg-gray-200",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 font-bold text-black">
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
                      classNames={{
                        inputWrapper:
                          "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                        input: "text-base",
                      }}
                      variant="bordered"
                      fullWidth={true}
                      placeholder="https://..."
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      onChange={onChange}
                      onBlur={onBlur}
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
                className={WHITEBUTTONCLASSNAMES}
                onClick={handleToggleMintModal}
              >
                Cancel
              </Button>

              <Button className={BLUEBUTTONCLASSNAMES} type="submit">
                Change Mint
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Relay Modal */}
      <Modal
        backdrop="blur"
        isOpen={showRelayModal}
        onClose={() => handleToggleRelayModal("")}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          header: "border-b-3 border-black bg-white rounded-t-xl",
          footer: "border-t-3 border-black bg-white rounded-b-xl",
          base: "border-3 border-black rounded-xl",
          closeButton: "hover:bg-gray-100 active:bg-gray-200",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 font-bold text-black">
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
                      classNames={{
                        inputWrapper:
                          "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                        input: "text-base",
                      }}
                      variant="bordered"
                      fullWidth={true}
                      placeholder="wss://..."
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      onChange={onChange}
                      onBlur={onBlur}
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
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => handleToggleRelayModal("")}
              >
                Cancel
              </Button>

              <Button className={BLUEBUTTONCLASSNAMES} type="submit">
                Add Relay
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Blossom Server Modal */}
      <Modal
        backdrop="blur"
        isOpen={showBlossomServerModal}
        onClose={() => handleToggleBlossomServerModal()}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          header: "border-b-3 border-black bg-white rounded-t-xl",
          footer: "border-t-3 border-black bg-white rounded-b-xl",
          base: "border-3 border-black rounded-xl",
          closeButton: "hover:bg-gray-100 active:bg-gray-200",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 font-bold text-black">
            Add Server
          </ModalHeader>
          <form onSubmit={handleBlossomSubmit(onBlossomSubmit)}>
            <ModalBody>
              <Controller
                name="server"
                control={blossomControl}
                rules={{
                  required: "A Blossom server URL is required.",
                  maxLength: {
                    value: 500,
                    message: "This input exceed maxLength of 500.",
                  },
                  validate: (value) =>
                    /^(https:\/\/|http:\/\/)/.test(value) ||
                    "Invalid Blossom server URL, must start with https:// or http://.",
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
                      classNames={{
                        inputWrapper:
                          "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                        input: "text-base",
                      }}
                      variant="bordered"
                      fullWidth={true}
                      placeholder="https://..."
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      onChange={onChange}
                      onBlur={onBlur}
                      value={value}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleBlossomSubmit(onBlossomSubmit)();
                        }
                      }}
                    />
                  );
                }}
              />
            </ModalBody>

            <ModalFooter>
              <Button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => handleToggleBlossomServerModal()}
              >
                Cancel
              </Button>

              <Button className={BLUEBUTTONCLASSNAMES} type="submit">
                Add Server
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
    </ProtectedRoute>
  );
};

export default AccountSettingsPage;
