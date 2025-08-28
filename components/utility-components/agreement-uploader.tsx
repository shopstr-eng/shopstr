import { useContext, useRef, useState } from "react";
import { Button, Input, Progress } from "@nextui-org/react";
import {
  blossomUpload,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import FailureModal from "./failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";

// Maximum file size in bytes (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf"];

export const AgreementUploaderButton = ({
  disabled,
  className,
  children,
  fileCallbackOnUpload,
  isProductUpload,
}: {
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  fileCallbackOnUpload: (imgUrl: string) => void;
  isProductUpload?: boolean;
}) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [previews, setPreviews] = useState<
    { src: string; name: string; size: number }[]
  >([]);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
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

  // Main upload logic
  const uploadImages = async (files: FileList) => {
    try {
      const agreementFiles = Array.from(files);

      // Strict MIME type check
      if (
        agreementFiles.some(
          (agrFile) =>
            !agrFile.type.startsWith("application/") ||
            !ALLOWED_TYPES.includes(agrFile.type)
        )
      ) {
        throw new Error("Only PDF files are supported!");
      }

      // File size check
      if (agreementFiles.some((agrFile) => agrFile.size > MAX_FILE_SIZE)) {
        throw new Error(
          `Each PDF must be smaller than ${MAX_FILE_SIZE / (1024 * 1024)} MB`
        );
      }

      setProgress(0);

      // Show base64 previews
      const previewsList = await Promise.all(
        agreementFiles.map(async (file) => {
          const base64 = await getBase64(file);
          return { src: base64, name: file.name, size: file.size };
        })
      );
      setPreviews(previewsList);

      // Stage 2: Uploading to servers (30% to 100%)
      let responses: any[] = [];
      if (isLoggedIn) {
        responses = await Promise.all(
          agreementFiles.map(async (agreementFile, idx) => {
            const tags = await blossomUpload(
              agreementFile,
              false,
              signer!,
              blossomServers && blossomServers.length > 0
                ? blossomServers
                : ["https://cdn.nostrcheck.me"]
            );
            setProgress(
              30 + Math.round(((idx + 1) / agreementFiles.length) * 70)
            );
            return tags;
          })
        );
      }

      const agreementUrls = responses
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

      if (agreementUrls && agreementUrls.length > 0) {
        return agreementUrls;
      } else {
        setFailureText(
          "PDF upload failed to yield a URL! Change your Blossom media server in settings or try again."
        );
        setShowFailureModal(true);
        return [];
      }
    } catch (e) {
      setProgress(null);
      setFailureText(
        e instanceof Error
          ? e.message
          : "Failed to upload PDF! Change your Blossom media server in settings."
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
        .forEach((imgUrl) => {
          fileCallbackOnUpload(imgUrl);
          // Store the uploaded file info for preview
          setUploadedFileUrl(imgUrl);
          if (files[0]) {
            setUploadedFileName(files[0].name);
          }
        });
    }
    setLoading(false);
    if (hiddenFileInput.current) {
      hiddenFileInput.current.value = "";
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Upload Button */}
      <div className="relative w-full">
        <Button
          isLoading={loading}
          onClick={handleClick}
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
            (isProductUpload ? (
              <span className="text-lg font-medium">Upload Agreement</span>
            ) : (
              "Upload Agreement"
            ))}
        </Button>

        <Input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          ref={hiddenFileInput}
          onInput={handleChange}
          className="hidden"
        />
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
                Uploading {previews.length} PDF
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

      {/* PDF Preview */}
      <AnimatePresence>
        {uploadedFileUrl && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="w-full space-y-4 rounded-lg border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-default-700">
                Uploaded Agreement Preview
              </h4>
              <Button
                size="sm"
                variant="light"
                color="danger"
                onClick={() => {
                  setUploadedFileUrl("");
                  setUploadedFileName("");
                }}
              >
                Remove
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-default-600">
                <span>📄</span>
                <span className="font-medium">{uploadedFileName}</span>
              </div>

              <div className="h-64 w-full overflow-hidden rounded-lg border">
                <iframe
                  src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(
                    uploadedFileUrl
                  )}`}
                  className="h-full w-full"
                  title="PDF Preview"
                  style={{ border: "none" }}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="bordered"
                  onClick={() => window.open(uploadedFileUrl, "_blank")}
                >
                  Open Full View
                </Button>
                <Button
                  size="sm"
                  variant="bordered"
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = uploadedFileUrl;
                    link.download = uploadedFileName;
                    link.click();
                  }}
                >
                  Download
                </Button>
              </div>
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
