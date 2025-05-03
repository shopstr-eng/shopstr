import { useContext, useRef, useState } from "react";
import { Button, Input } from "@nextui-org/react";
import {
  blossomUploadImages,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import FailureModal from "./failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

// Maximum file size in bytes (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// Allowed MIME types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const FileUploaderButton = ({
  disabled,
  isIconOnly,
  className,
  children,
  imgCallbackOnUpload,
}: {
  disabled?: boolean;
  isIconOnly: boolean;
  className: string;
  children: React.ReactNode;
  imgCallbackOnUpload: (imgUrl: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [previews, setPreviews] = useState<string[]>([]); // base64 previews

  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const { signer, isLoggedIn } = useContext(SignerContext);
  const { blossomServers } = getLocalStorageData() || {};

  // Create base64 preview for UI
  const getBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Strip metadata from image
  const stripImageMetadata = async (imageFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(imageFile);

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to create blob"));
            return;
          }
          const strippedFile = new File([blob], imageFile.name, {
            type: imageFile.type,
            lastModified: Date.now(),
          });
          URL.revokeObjectURL(url);
          resolve(strippedFile);
        }, imageFile.type);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  };

  // Main upload logic
  const uploadImages = async (files: FileList) => {
    try {
      const imageFiles = Array.from(files);

      // Strict MIME type check
      if (
        imageFiles.some(
          (imgFile) =>
            !imgFile.type.startsWith("image/") ||
            !ALLOWED_TYPES.includes(imgFile.type)
        )
      ) {
        throw new Error(
          "Only JPEG, PNG, or WebP images are supported!"
        );
      }

      // File size check
      if (imageFiles.some((imgFile) => imgFile.size > MAX_FILE_SIZE)) {
        throw new Error(
          `Each image must be smaller than ${MAX_FILE_SIZE / (1024 * 1024)} MB`
        );
      }

      setProgress(0);

      // Show base64 previews
      const base64List = await Promise.all(
        imageFiles.map((file) => getBase64(file))
      );
      setPreviews(base64List);

      // Strip metadata
      const strippedImageFiles = await Promise.all(
        imageFiles.map(async (imageFile, idx) => {
          const stripped = await stripImageMetadata(imageFile);
          setProgress(Math.round(((idx + 1) / imageFiles.length) * 30));
          return stripped;
        })
      );

      let responses: any[] = [];
      if (isLoggedIn) {
        responses = await Promise.all(
          strippedImageFiles.map(async (imageFile, idx) => {
            const tags = await blossomUploadImages(
              imageFile,
              signer!,
              blossomServers && blossomServers.length > 0
                ? blossomServers
                : ["https://cdn.nostrcheck.me"]
            );
            setProgress(30 + Math.round(((idx + 1) / strippedImageFiles.length) * 70));
            return tags;
          })
        );
      }

      const imageUrls = responses
        .filter((response) => response && Array.isArray(response))
        .map((response: string[][]) => {
          const urlTag = response.find(
            (tag) => Array.isArray(tag) && tag[0] === "url"
          );
          if (urlTag && urlTag.length > 1) {
            return urlTag[1];
          }
          return null;
        })
        .filter((url) => url !== null);

      setProgress(null);

      if (imageUrls && imageUrls.length > 0) {
        return imageUrls;
      } else {
        setFailureText(
          "Image upload failed to yield a URL! Change your Blossom media server in settings or try again."
        );
        setShowFailureModal(true);
        return [];
      }
    } catch (e) {
      setProgress(null);
      setFailureText(
        e instanceof Error
          ? e.message
          : "Failed to upload image! Change your Blossom media server in settings."
      );
      setShowFailureModal(true);
      return [];
    }
  };

  const handleClick = () => {
    if (disabled || loading) return;
    hiddenFileInput.current?.click();
  };

  const handleChange = async (e: React.FormEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    setLoading(true);
    if (files) {
      const uploadedImages = await uploadImages(files);
      uploadedImages
        .filter((imgUrl): imgUrl is string => imgUrl !== null)
        .forEach((imgUrl) => imgCallbackOnUpload(imgUrl));
    }
    setLoading(false);
    setProgress(null);
    if (hiddenFileInput.current) {
      hiddenFileInput.current.value = "";
    }
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
        accept={ALLOWED_TYPES.join(",")}
        multiple
        ref={hiddenFileInput}
        onInput={handleChange}
        className="hidden"
      />
      {/* Image Previews */}
      {previews.length > 0 && (
        <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
          {previews.map((src, idx) => (
            <img
              key={idx}
              src={src}
              alt={`preview-${idx}`}
              style={{
                width: 80,
                height: 80,
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid #eee",
              }}
            />
          ))}
        </div>
      )}
      {/* Progress Bar */}
      {progress !== null && (
        <div style={{ width: "100%", marginTop: 8 }}>
          <div
            style={{
              height: 4,
              width: `${progress}%`,
              background: "#0070f3",
              borderRadius: 2,
              transition: "width 0.3s",
            }}
          />
        </div>
      )}
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
