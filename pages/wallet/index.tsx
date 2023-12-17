import Link from "next/link";
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
import { SHOPSTRBUTTONCLASSNAMES } from "../components/utility/STATIC-VARIABLES";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";

const Mints = () => {
  const [mints, setMints] = useState([]);
  const [mintUrl, setMintUrl] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedMintss = localStorage.getItem("mints");
      setMints(storedMints ? JSON.parse(storedMints) : []);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mints", JSON.stringify(mints));
  }, [mints]);

  const {
    handleSubmit,
    formState: { errors },
    control,
    reset,
  } = useForm();

  const onSubmit = async (data) => {
    let mint = data["mint"];
    await addMint(mint);
  };

  const handleToggleModal = () => {
    reset();
    setShowModal(!showModal);
  };

  const addMint = async (newMint: string) => {
    const mintTest = new CashuWallet(
      new CashuMint(
        newMint,
      ),
    );
    if (mintTest.requestMint(1)) {
      setMints([...mints, newMint]);
      handleToggleModal();
    } else {
      alert(`Mint ${newMint} was not valid!`);
    }
  };

  const deleteMint = (mintToDelete) => {
    setMints(mints.filter((mint) => mint !== mintToDelete));
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(mintUrl);
    alert("Mint URL copied to clipboard!");
  };

  return (
    <div>
      {mints.length === 0 && (
        <div className="mt-8 flex items-center justify-center">
          <p className="break-words text-center text-xl dark:text-dark-text">
            No mints added . . .
          </p>
        </div>
      )}
      <div className="mb-8 mt-8 max-h-96 overflow-y-scroll rounded-md bg-light-bg dark:bg-dark-bg">
        {mints.map((mint) => (
          <div
            key={mint}
            className="mx-3 mb-2 flex items-center justify-between rounded-md border-2 border-light-fg px-3 py-2 dark:border-dark-fg"
          >
            <div className="max-w-xsm truncate text-light-text dark:text-dark-text">
              {mint}
            </div>
            <MinusCircleIcon
              onClick={() => deleteMint(mint)}
              className="h-5 w-5 cursor-pointer text-red-500 hover:text-yellow-700"
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-[0px] z-20 flex h-fit w-[99vw] flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
        <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={handleToggleModal}>
          Add New Mint
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
            Add New Mint
          </ModalHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <ModalBody>
              <Controller
                name="mint"
                control={control}
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
                Add Mint
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
    // <div className="m-[20vh] flex h-max items-center justify-center">
    //   <p className="max-w-[48vh] break-words text-center text-3xl text-light-text dark:text-dark-text">
    //     A native wallet is coming soon! For now, you can claim your tokens for
    //     Bitcoin on
    //     <Link
    //       href="https://wallet.nutstash.app/"
    //       className="text-accent-light-text hover:text-purple-700 dark:text-accent-dark-text hover:dark:text-yellow-700"
    //     >
    //       {" "}
    //       Nutstash{" "}
    //     </Link>
    //     using
    //     <span
    //       className="text-accent-light-text hover:text-purple-700 dark:text-accent-dark-text hover:dark:text-yellow-700"
    //       onClick={handleCopyInvoice}
    //     >
    //       {" "}
    //       {mintUrl}{" "}
    //     </span>
    //     as the mint URL.
    //   </p>
    // </div>
  );
};
export default Mints;
