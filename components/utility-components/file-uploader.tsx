import { Button, Input } from "@nextui-org/react";
import { useRef, useState } from "react";
import {
  getLocalStorageData,
  getNsecWithPassphrase,
  getPrivKeyWithPassphrase,
  nostrBuildUploadImages,
} from "../utility/nostr-helper-functions";
import { finalizeEvent } from "nostr-tools";

export const FileUploaderButton = ({
  disabled,
  isIconOnly,
  className,
  children,
  passphrase,
  imgCallbackOnUpload,
}: {
  disabled?: any;
  isIconOnly: boolean;
  className: any;
  children: React.ReactNode;
  passphrase: string;
  imgCallbackOnUpload: (imgUrl: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  // Create a reference to the hidden file input element
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const { signInMethod } = getLocalStorageData();

  const uploadImages = async (files: FileList) => {
    try {
      const imageFiles = Array.from(files);

      if (imageFiles.some((imgFile) => !imgFile.type.includes("image"))) {
        throw new Error("Only images are supported");
      }
      let response;
      if (signInMethod === "nsec") {
        if (!passphrase || !getNsecWithPassphrase(passphrase))
          throw new Error("Invalid passphrase!");
        const privkey = getPrivKeyWithPassphrase(passphrase);
        response = await nostrBuildUploadImages(imageFiles, (e) =>
          Promise.resolve(finalizeEvent(e, privkey as Uint8Array)),
        );
      } else if (signInMethod === "extension") {
        response = await nostrBuildUploadImages(
          imageFiles,
          async (e) => await window.nostr.signEvent(e),
        );
      }
      const imageUrls = response?.map((i) => i.url);
      if (imageUrls && imageUrls[0]) {
        imgCallbackOnUpload(imageUrls[0]);
      } else {
        alert("Image upload failed to yield img URL");
      }
    } catch (e) {
      if (e instanceof Error) alert("Failed to upload image! " + e.message);
    }
  };

  // Programatically click the hidden file input element
  // when the Button component is clicked
  const handleClick = () => {
    if (disabled || loading) {
      // if button is disabled or loading, return
      return;
    }
    hiddenFileInput.current?.click();
  };
  // Call a function (passed as a prop from the parent component)
  // to handle the user-selected files
  const handleChange = async (e: React.FormEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    setLoading(true);
    if (files) {
      await uploadImages(files);
    }
    setLoading(false);
  };
  return (
    <>
      <Button
        isLoading={loading}
        onClick={handleClick}
        isIconOnly={isIconOnly}
        className={className}
      >
        {children}
      </Button>
      <Input
        type="file"
        accept="image/*"
        ref={hiddenFileInput}
        onInput={handleChange}
        className="hidden"
      />
    </>
  );
};
