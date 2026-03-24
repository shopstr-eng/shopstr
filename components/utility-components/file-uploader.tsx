import { useContext, useRef, useState } from "react";
import type React from "react";
import { Button, Progress } from "@nextui-org/react";
import {
  blossomUpload,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { AnimatePresence, motion } from "framer-motion";
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { PRIMARYBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_STRIP_SIZE = 25 * 1024 * 1024;
const COMPRESSION_THRESHOLD = 20 * 1024 * 1024;

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

  const getPreviewUrl = (file: File): string => URL.createObjectURL(file);

  const MAX_CANVAS_DIMENSION = 4096;

  const stripImageMetadata = async (imageFile: File): Promise<File> => {
    try {
      const bitmap = await createImageBitmap(imageFile);

      let targetWidth = bitmap.width;
      let targetHeight = bitmap.height;

      if (
        targetWidth > MAX_CANVAS_DIMENSION ||
        targetHeight > MAX_CANVAS_DIMENSION
      ) {
        const scale = Math.min(
          MAX_CANVAS_DIMENSION / targetWidth,
          MAX_CANVAS_DIMENSION / targetHeight
        );
        targetWidth = Math.round(targetWidth * scale);
        targetHeight = Math.round(targetHeight * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        throw new Error("Failed to get canvas context");
      }

      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) {
              reject(new Error("Failed to create blob"));
              return;
            }
            resolve(b);
          },
          imageFile.type,
          0.92
        );
      });

      canvas.width = 0;
      canvas.height = 0;

      const outputType = blob.type || imageFile.type;

      return new File([blob], imageFile.name, {
        type: outputType,
        lastModified: Date.now(),
      });
    } catch (e) {
      console.error("Metadata stripping failed, using original file:", e);
      return imageFile;
    }
  };

  const compressImage = async (imageFile: File): Promise<File> => {
    try {
      const bitmap = await createImageBitmap(imageFile);

      let targetWidth = bitmap.width;
      let targetHeight = bitmap.height;

      if (
        targetWidth > MAX_CANVAS_DIMENSION ||
        targetHeight > MAX_CANVAS_DIMENSION
      ) {
        const scale = Math.min(
          MAX_CANVAS_DIMENSION / targetWidth,
          MAX_CANVAS_DIMENSION / targetHeight
        );
        targetWidth = Math.round(targetWidth * scale);
        targetHeight = Math.round(targetHeight * scale);
      }

      const isPng = imageFile.type === "image/png";
      const outputType = isPng ? "image/jpeg" : imageFile.type;
      const outputName = isPng
        ? imageFile.name.replace(/\.png$/i, ".jpg")
        : imageFile.name;

      const qualitySteps = [0.85, 0.75, 0.65, 0.5, 0.4, 0.3];
      const scaleSteps = [1.0, 0.85, 0.7, 0.5, 0.35];

      let lastBlob: Blob | null = null;

      for (const scale of scaleSteps) {
        const w = Math.round(targetWidth * scale);
        const h = Math.round(targetHeight * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        if (isPng) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, w, h);
        }

        ctx.drawImage(bitmap, 0, 0, w, h);

        for (const quality of qualitySteps) {
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) =>
                b ? resolve(b) : reject(new Error("Failed to create blob")),
              outputType,
              quality
            );
          });

          lastBlob = blob;

          if (blob.size <= COMPRESSION_THRESHOLD) {
            bitmap.close();
            return new File([blob], outputName, {
              type: outputType,
              lastModified: Date.now(),
            });
          }
        }
      }

      bitmap.close();

      if (lastBlob && lastBlob.size < imageFile.size) {
        return new File([lastBlob], outputName, {
          type: outputType,
          lastModified: Date.now(),
        });
      }

      return imageFile;
    } catch (e) {
      console.error("Image compression failed, using original file:", e);
      return imageFile;
    }
  };

  const revokePreviewUrls = (urls: { src: string }[]) => {
    urls.forEach((p) => URL.revokeObjectURL(p.src));
  };

  const uploadImages = async (files: FileList) => {
    let previewsList: { src: string; name: string; size: number }[] = [];
    try {
      const imageFiles = Array.from(files);

      if (
        imageFiles.some(
          (imgFile) =>
            !imgFile.type.startsWith("image/") ||
            !ALLOWED_TYPES.includes(imgFile.type)
        )
      ) {
        throw new Error("Only JPEG, PNG, or WebP images are supported!");
      }

      setProgress(0);

      previewsList = imageFiles.map((file) => ({
        src: getPreviewUrl(file),
        name: file.name,
        size: file.size,
      }));
      setPreviews(previewsList);

      const processedImageFiles: File[] = [];
      for (let idx = 0; idx < imageFiles.length; idx++) {
        const imageFile = imageFiles[idx]!;
        let processed: File;
        if (imageFile.size > MAX_STRIP_SIZE) {
          processed = imageFile;
        } else {
          processed = await stripImageMetadata(imageFile);
        }
        if (processed.size > COMPRESSION_THRESHOLD) {
          processed = await compressImage(processed);
        }
        processedImageFiles.push(processed);
        setProgress(Math.round(((idx + 1) / imageFiles.length) * 30));
      }

      let responses: any[] = [];
      if (isLoggedIn) {
        responses = await Promise.all(
          processedImageFiles.map(async (imageFile, idx) => {
            const tags = await blossomUpload(
              imageFile,
              true,
              signer!,
              blossomServers && blossomServers.length > 0
                ? blossomServers
                : ["https://cdn.nostrcheck.me"]
            );
            setProgress(
              30 + Math.round(((idx + 1) / processedImageFiles.length) * 70)
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
        setProgress(null);
        revokePreviewUrls(previewsList);
        setPreviews([]);
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
      revokePreviewUrls(previewsList);
      setPreviews([]);
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

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
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
            ? // Updated placeholder styles
              "flex h-full min-h-[250px] items-center justify-center rounded-md border-2 border-dashed border-black p-6"
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
              {/* Updated icon color */}
              <PhotoIcon className="mb-4 h-16 w-16 text-black" />
            </motion.div>
            {/* Updated text color */}
            <p className="text-xl font-semibold text-black">
              {isDragging ? "Drop to upload" : "Drag & Drop Images Here"}
            </p>
            {/* Updated text color */}
            <p className="mt-1 text-center text-sm text-black">
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
            // Updated button styles
            className={`${PRIMARYBUTTONCLASSNAMES} ${
              isProductUpload ? "w-full" : ""
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

        <input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          ref={hiddenFileInput}
          onChange={handleChange}
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
              {/* Updated text color */}
              <span className="text-sm font-medium text-black">
                Uploading {previews.length} image
                {previews.length > 1 ? "s" : ""}
              </span>
              {/* Updated text color */}
              <span className="text-sm font-medium text-black">
                {progress}%
              </span>
            </div>
            <Progress
              aria-label="Upload progress"
              size="md"
              value={progress}
              classNames={{
                track: "h-3 rounded-md border-2 border-black bg-white",
                // Updated progress bar color
                indicator: "bg-primary-yellow",
              }}
            />
            {/* Updated text color */}
            <div className="flex justify-between text-xs text-black">
              <span>Preprocessing{progress >= 30 ? " ✓" : ""}</span>
              <span>Uploading{progress >= 100 ? " ✓" : ""}</span>
              <span>Processing</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFailureModal && failureText && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30"
          >
            <XCircleIcon className="h-5 w-5 flex-shrink-0 text-red-500" />
            <span className="flex-1 text-sm text-red-700 dark:text-red-300">
              {failureText}
            </span>
            <button
              type="button"
              onClick={() => {
                setShowFailureModal(false);
                setFailureText("");
              }}
              className="flex-shrink-0 rounded-full p-0.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-800/50"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
