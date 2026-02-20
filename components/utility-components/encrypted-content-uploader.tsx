import { useContext, useRef, useState, useMemo } from "react";
import { Button } from "@nextui-org/react";
import {
  blossomUploadFile,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  encodeDigitalContentPayload,
  decodeDigitalContentPayload,
  encryptFileWithNip44,
} from "@/utils/encryption/file-encryption";
import FailureModal from "./failure-modal";
import { TrashIcon, DocumentIcon } from "@heroicons/react/24/outline";

export default function EncryptedContentUploader({
  currentPayload,
  onUploadComplete,
  className,
}: {
  currentPayload?: string;
  onUploadComplete: (encodedPayload: string) => void;
  className?: string;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { signer, isLoggedIn } = useContext(SignerContext);
  const { blossomServers } = getLocalStorageData() || {};

  const fileInfo = useMemo(() => {
    if (!currentPayload) return null;
    try {
      return decodeDigitalContentPayload(currentPayload);
    } catch (e) {
      return null;
    }
  }, [currentPayload]);

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    onUploadComplete("");
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile || !signer || !isLoggedIn) {
      return;
    }

    try {
      setIsUploading(true);
      const { encryptedFile, fileNsec } = await encryptFileWithNip44(selectedFile);

      const fallbackServers = [
        "https://blossom.primal.net",
        "https://satellite.earth",
        "https://files.v0l.io",
        "https://cdn.nostrcheck.me",
        "https://nostr.build",
        "https://blossom.io",
      ];

      const userServers = blossomServers || [];
      const serversToTry = Array.from(
        new Set([...fallbackServers, ...userServers])
      );

      let uploadedUrl: string | undefined;
      let lastError: any = null;

      for (const server of serversToTry) {
        try {
          const tags = await blossomUploadFile(encryptedFile, signer, [server]);
          uploadedUrl = tags.find((tag) => tag[0] === "url")?.[1];

          if (uploadedUrl) {
            break;
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (!uploadedUrl) {
        throw new Error(
          lastError?.message ||
            "All Blossom servers rejected the file. Try a different file or check your network."
        );
      }

      const encodedPayload = encodeDigitalContentPayload({
        url: uploadedUrl,
        nsec: fileNsec,
        mimeType: selectedFile.type,
        fileName: selectedFile.name,
      });

      onUploadComplete(encodedPayload);
    } catch (uploadError: any) {
      console.error("Encrypted content upload failed:", uploadError);
      setFailureText(`Upload failed: ${uploadError.message}`);
      setShowFailureModal(true);
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  return (
    <>
      <div className="flex w-full flex-col gap-2">
        {fileInfo ? (
          <div className="flex items-center justify-between rounded-lg border-2 border-dashed border-shopstr-purple/50 bg-shopstr-purple/5 p-3 dark:border-shopstr-yellow/50 dark:bg-shopstr-yellow/5">
            <div className="flex items-center gap-3 overflow-hidden">
              <DocumentIcon className="h-8 w-8 flex-shrink-0 text-shopstr-purple dark:text-shopstr-yellow" />
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium">
                  {fileInfo.fileName || "Encrypted Asset"}
                </span>
                <span className="text-tiny uppercase opacity-60">
                  {fileInfo.mimeType?.split("/")[1] || "file"} attached
                </span>
              </div>
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              onClick={handleRemove}
            >
              <TrashIcon className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleUpload}
            />
            <Button
              type="button"
              className={className}
              onClick={handlePickFile}
              isLoading={isUploading}
            >
              {isUploading
                ? "Encrypting & Uploading..."
                : "Upload Digital Content"}
            </Button>
          </div>
        )}
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
}
