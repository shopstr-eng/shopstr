import { useContext, useRef, useState } from "react";
import { Button, Input, Progress } from "@nextui-org/react";
import {
  blossomUpload,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import FailureModal from "./failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { AnimatePresence, motion } from "framer-motion";
import { PhotoIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";

// Maximum file size in bytes (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const FileUploaderButton = ({
  disabled,
  isIconOnly,
  className,
  children,
  imgCallbackOnUpload,
  isPlaceholder,
  isProductUpload,
}: {
  disabled?: boolean;
  isIconOnly?: boolean;
  className?: string;
  children?: React.ReactNode;
  imgCallbackOnUpload: (imgUrl: string) => void;
  isPlaceholder?: boolean;
  isProductUpload?: boolean;
}) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [previews, setPreviews] = useState<
    { src: string; name: string; size: number }[]
  >([]);
  const [isDragging, setIsDragging] = useState(false);

  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
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
        throw new Error("Only JPEG, PNG, or WebP images are supported!");
      }

      // File size check
      if (imageFiles.some((imgFile) => imgFile.size > MAX_FILE_SIZE)) {
        throw new Error(
          `Each image must be smaller than ${MAX_FILE_SIZE / (1024 * 1024)} MB`
        );
      }

      setProgress(0);

      // Show base64 previews
      const previewsList = await Promise.all(
        imageFiles.map(async (file) => {
          const base64 = await getBase64(file);
          return { src: base64, name: file.name, size: file.size };
        })
      );
      setPreviews(previewsList);

      // Stage 1: Stripping metadata (30%)
      const strippedImageFiles = await Promise.all(
        imageFiles.map(async (imageFile, idx) => {
          const stripped = await stripImageMetadata(imageFile);
          setProgress(Math.round(((idx + 1) / imageFiles.length) * 30));
          return stripped;
        })
      );

      // Stage 2: Uploading to servers (30% to 100%)
      let responses: any[] = [];
      if (isLoggedIn) {
        responses = await Promise.all(
          strippedImageFiles.map(async (imageFile, idx) => {
            const tags = await blossomUpload(
              imageFile,
              true,
              signer!,
              blossomServers && blossomServers.length > 0
                ? blossomServers
                : ["https://cdn.nostrcheck.me"]
            );
            setProgress(
              30 + Math.round(((idx + 1) / strippedImageFiles.length) * 70)
            );
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

      setTimeout(() => {
        setProgress(null); // Reset progress after a short delay for better UX
      }, 500);

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
    if (hiddenFileInput.current) {
      hiddenFileInput.current.value = "";
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setLoading(true);
      const uploadedImages = await uploadImages(files);
      uploadedImages
        .filter((imgUrl): imgUrl is string => imgUrl !== null)
        .forEach((imgUrl) => imgCallbackOnUpload(imgUrl));
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Drag and Drop Zone */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-full duration-300 transition-all ${
          isPlaceholder
            ? "flex h-full min-h-[250px] items-center justify-center rounded-xl border-2 border-dashed border-dark-text p-6"
            : !isDragging && "border-2 border-dashed border-transparent"
        }`}
      >
        {/* Drag overlay or placeholder state */}
        {(isDragging || isPlaceholder) && (
          <motion.div
            className={`${
              !isPlaceholder && "absolute inset-0"
            } z-10 flex flex-col items-center justify-center rounded-xl`}
            initial={{ opacity: isPlaceholder ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              <PhotoIcon className="mb-4 h-16 w-16 text-dark-text" />
            </motion.div>
            <p className="text-xl font-semibold text-dark-text">
              {isDragging ? "Drop to upload" : "Drag & Drop Images Here"}
            </p>
            <p className="mt-1 text-center text-sm text-dark-text">
              {isPlaceholder && !isDragging
                ? "Or click below to select files"
                : "Supports JPEG, PNG, WebP"}
            </p>
          </motion.div>
        )}

        {!isPlaceholder && (
          /* Full-width upload button - only show when not in placeholder mode */
          <Button
            isLoading={loading}
            onClick={handleClick}
            isIconOnly={isIconOnly}
            disabled={disabled || loading}
            className={`${
              isProductUpload && "w-full"
            } ${className} transition-all`}
            startContent={
              <motion.div
                animate={loading ? {} : { scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <ArrowUpTrayIcon className="h-6 w-6" />
              </motion.div>
            }
          >
            {children ||
              (isIconOnly ? null : isProductUpload ? (
                <span className="text-lg font-medium">Upload Images</span>
              ) : (
                <span className="text-lg font-medium">Upload Banner</span>
              ))}
          </Button>
        )}

        <Input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          ref={hiddenFileInput}
          onInput={handleChange}
          className="hidden"
        />

        {isPlaceholder && (
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={handleClick}
            aria-label="Click to upload images"
          />
        )}
      </div>

      {/* Progress Bar */}
      <AnimatePresence>
        {progress !== null && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-default-700">
                Uploading {previews.length} image
                {previews.length > 1 ? "s" : ""}
              </span>
              <span className="text-sm font-medium text-yellow-600">
                {progress}%
              </span>
            </div>
            <Progress
              aria-label="Upload progress"
              size="md"
              value={progress}
              color="warning"
              classNames={{
                track: "h-3",
                indicator: "bg-gradient-to-r from-pink-400 to-pink-600",
              }}
            />
            <div className="flex justify-between text-xs text-default-500">
              <span>Preprocessing{progress >= 30 ? " ✓" : ""}</span>
              <span>Uploading{progress >= 100 ? " ✓" : ""}</span>
              <span>Processing</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </div>
  );
};
