import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { MinusCircleIcon } from "@heroicons/react/24/outline";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";
import { relayInit } from "nostr-tools";
import { SHOPSTRBUTTONCLASSNAMES } from "../components/utility/STATIC-VARIABLES";

const Relays = () => {
  const [relays, setRelays] = useState([]);
  // make initial state equal to proprietary relay
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("relays", JSON.stringify(relays));
  }, [relays]);

  const {
    handleSubmit,
    formState: { errors },
    control,
    reset,
  } = useForm();

  const onSubmit = async (data) => {
    let relay = data["relay"];
    await addRelay(relay);
  };

  const handleToggleModal = () => {
    reset();
    setShowModal(!showModal);
  };

  const addRelay = async (newRelay: string) => {
    const relayTest = relayInit(newRelay);
    try {
      await relayTest.connect();
      setRelays([...relays, newRelay]);
      relayTest.close();
      handleToggleModal();
    } catch {
      alert(`Relay ${newRelay} was unable to connect!`);
    }
  };

  const deleteRelay = (relayToDelete) => {
    setRelays(relays.filter((relay) => relay !== relayToDelete));
  };

  return (
    <div>
      {relays.length === 0 && (
        <div className="mt-8 flex items-center justify-center">
          <p className="break-words text-center text-xl">
            No relays added . . .
          </p>
        </div>
      )}
      <div className="mb-8 mt-8 max-h-96 overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
        {relays.map((relay) => (
          <div
            key={relay}
            className="mx-3 mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg"
          >
            <div className="max-w-xsm truncate text-light-text dark:text-dark-text">
              {relay}
            </div>
            <MinusCircleIcon
              onClick={() => deleteRelay(relay)}
              className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-[0px] z-20 flex h-fit w-[99vw] flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
        <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={handleToggleModal}>
          Add New Relay
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
            Add New Relay
          </ModalHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <ModalBody>
              <Controller
                name="relay"
                control={control}
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
                Add Relay
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Relays;
