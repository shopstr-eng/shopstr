import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
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
import { relayConnect } from "nostr-tools";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { getLocalStorageData } from "../../components/utility/nostr-helper-functions";
import { useRouter } from "next/router";
import { ProfileAvatar } from "@/components/utility-components/profile/avatar";
import { useTheme } from "next-themes";

const SettingsPage = () => {
  const [relays, setRelays] = useState(Array<string>(0));
  // make initial state equal to proprietary relay
  const [showRelayModal, setShowRelayModal] = useState(false);

  const [mints, setMints] = useState(Array<string>(0));
  const [mintUrl, setMintUrl] = useState("");
  const [showMintModal, setShowMintModal] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMints(getLocalStorageData().mints);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mints", JSON.stringify(mints));
  }, [mints]);

  const { theme, setTheme } = useTheme();

  const {
    handleSubmit: handleMintSubmit,
    formState: { errors },
    control: mintControl,
    reset: mintReset,
  } = useForm();

  const onMintSubmit = async (data) => {
    let mint = data["mint"];
    await replaceMint(mint);
  };

  const {
    handleSubmit: handleRelaySubmit,
    formState: { errors: errorsRelay },
    control: relayControl,
    reset: relayReset,
  } = useForm();

  const onRelaySubmit = async (data) => {
    let relay = data["relay"];
    await addRelay(relay);
  };

  const handleToggleMintModal = () => {
    mintReset();
    setShowMintModal(!showMintModal);
  };

  const replaceMint = async (newMint: string) => {
    try {
      // Perform a fetch request to the specified mint URL
      const response = await fetch(newMint + "/keys");
      // Check if the response status is in the range of 200-299
      if (response.ok) {
        setMints([newMint]);
        handleToggleMintModal();
      } else {
        alert(
          `Failed to add mint!. Could not fetch keys from ${newMint}/keys.`,
        );
      }
    } catch {
      // If the fetch fails, alert the user
      alert(`Failed to add mint!. Could not fetch keys from ${newMint}/keys.`);
    }
  };

  const deleteMint = (mintToDelete) => {
    setMints(mints.filter((mint) => mint !== mintToDelete));
  };

  const handleCopyMint = () => {
    navigator.clipboard.writeText(mintUrl);
    alert("Mint URL copied to clipboard!");
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRelays(getLocalStorageData().relays);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("relays", JSON.stringify(relays));
  }, [relays]);

  const handleToggleRelayModal = () => {
    relayReset();
    setShowRelayModal(!showRelayModal);
  };

  const addRelay = async (newRelay: string) => {
    try {
      const relayTest = await relayConnect(newRelay);
      setRelays([...relays, newRelay]);
      relayTest.close();
      handleToggleRelayModal();
    } catch {
      alert(`Relay ${newRelay} was unable to connect!`);
    }
  };

  const deleteRelay = (relayToDelete) => {
    setRelays(relays.filter((relay) => relay !== relayToDelete));
  };

  const useLoaded = () => {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => setLoaded(true), []);
    return loaded;
  };

  return (
    <div className="flex h-full flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      <div>
        <span className="mb-4 flex px-4 text-2xl font-bold text-light-text dark:text-dark-text">
          Account
        </span>
        <div>
          <div className="mb-2 ml-4 flex-col">
            <ProfileAvatar
              pubkey={getLocalStorageData().decryptedNpub}
              includeDisplayName
            ></ProfileAvatar>
          </div>
          <div className="mx-3 mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg">
            <div
              className="max-w-xsm break-all text-light-text dark:text-dark-text"
              suppressHydrationWarning
            >
              {getLocalStorageData().npub}
            </div>
          </div>
        </div>
        <div>
          <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
              onClick={() => {
                localStorage.removeItem("npub");
                localStorage.removeItem("signIn");
                localStorage.removeItem("encryptedPrivateKey");
                localStorage.removeItem("decryptedNpub"); // does this exist?

                router.push("/");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>

        <span className="mt-4 flex px-4 text-2xl font-bold text-light-text dark:text-dark-text">
          Relays
        </span>

        {relays.length === 0 && (
          <div className="mt-4 flex items-center justify-center">
            <p className="break-words text-center text-xl dark:text-dark-text">
              No relays added . . .
            </p>
          </div>
        )}
        <div className="mt-4 max-h-96 overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
          {relays.map((relay) => (
            <div
              key={relay}
              className="mx-3 mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg"
            >
              <div className="max-w-xsm break-all text-light-text dark:text-dark-text ">
                {relay}
              </div>
              <MinusCircleIcon
                onClick={() => deleteRelay(relay)}
                className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
              />
            </div>
          ))}
        </div>
        <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
          <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={handleToggleRelayModal}
          >
            Add New Relay
          </Button>
        </div>
        <Modal
          backdrop="blur"
          isOpen={showRelayModal}
          onClose={handleToggleRelayModal}
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
              Add New Relay
            </ModalHeader>
            <form onSubmit={handleRelaySubmit(onRelaySubmit)}>
              <ModalBody>
                <Controller
                  name="relay"
                  control={relayControl}
                  rules={{
                    required: "A relay URL is required.",
                    maxLength: {
                      value: 300,
                      message: "This input exceed maxLength of 300.",
                    },
                    validate: (value) =>
                      /^(wss:\/\/|ws:\/\/)/.test(value) ||
                      "Invalid relay URL, must start with wss:// or ws://.",
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
                  onClick={handleToggleRelayModal}
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
      </div>

      <span className="my-4 flex px-4 text-2xl font-bold text-light-text dark:text-dark-text">
        Mint
      </span>

      <div>
        {mints.length === 0 && (
          <div className="mt-8 flex items-center justify-center">
            <p className="break-words text-center text-xl dark:text-dark-text">
              No mints added . . .
            </p>
          </div>
        )}

        <div className="overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
          {mints.map((mint) => (
            <div
              key={mint}
              className="mx-3 mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg"
            >
              <div className="max-w-xsm break-all text-light-text dark:text-dark-text">
                {mint}
              </div>
              {/* <MinusCircleIcon
              onClick={() => deleteMint(mint)}
              className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
            /> */}
            </div>
          ))}
        </div>
        {mints.length > 0 && (
          <div className="mx-4 my-4 flex items-center justify-center text-center">
            <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
            <p className="ml-2 text-sm text-light-text dark:text-dark-text">
              Copy and paste the above mint URL into your preferred Cashu wallet
              to redeem your tokens!
            </p>
          </div>
        )}

        <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
          <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={handleToggleMintModal}
          >
            Change Mint
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
              Change Mint
            </ModalHeader>
            <form onSubmit={handleMintSubmit(onMintSubmit)}>
              <ModalBody>
                <Controller
                  name="mint"
                  control={mintControl}
                  rules={{
                    required: "A mint URL is required.",
                    maxLength: {
                      value: 300,
                      message: "This input exceed maxLength of 300.",
                    },
                    validate: (value) =>
                      /^(https:\/\/|http:\/\/)/.test(value) ||
                      "Invalid mint URL, must start with https:// or http://.",
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

      <span className="my-4 flex px-4 text-2xl font-bold text-light-text dark:text-dark-text">
        Theme
      </span>
      {useLoaded() && (
        <RadioGroup
          className="ml-4"
          label="Select your prefered theme"
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
  );
};

export default SettingsPage;
