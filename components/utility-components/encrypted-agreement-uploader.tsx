import { useState, useContext } from "react";
import type React from "react";
import { Button } from "@nextui-org/react";
import { WHITEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "./nostr-context-provider";
import {
  getLocalStorageData,
  blossomUpload,
} from "@/utils/nostr/nostr-helper-functions";
import { encryptFileWithNip44 } from "@/utils/encryption/file-encryption";
import FailureModal from "./failure-modal";

interface EncryptedAgreementUploaderButtonProps {
  children: React.ReactNode;
  fileCallbackOnUpload: (fileUrl: string) => void;
  sellerNpub: string; // Can be npub or hex pubkey
}

export function EncryptedAgreementUploaderButton({
  children,
  fileCallbackOnUpload,
  sellerNpub,
}: EncryptedAgreementUploaderButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const { signer } = useContext(SignerContext);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setFailureText("Please upload a PDF file only.");
      setShowFailureModal(true);
      return;
    }

    setIsUploading(true);

    try {
      // Encrypt the file before uploading
      // Use server-side encryption for product form uploads (seller uploading agreement)
      // Only use signer for buyer-side encryption after signing
      const encryptedFile = await encryptFileWithNip44(
        file,
        sellerNpub,
        false,
        undefined // Always use server-side encryption for uploads
      );

      // Get blossom servers from local storage
      const { blossomServers } = getLocalStorageData();

      // Convert encrypted file to PDF type for blossom upload
      const pdfFile = new File(
        [encryptedFile],
        `encrypted-agreement-${Date.now()}.pdf`,
        {
          type: "application/pdf",
        }
      );

      // Upload the encrypted file
      const uploadTags = await blossomUpload(
        pdfFile,
        false, // isImage = false for PDF
        signer!,
        blossomServers
      );

      // Extract the URL from the upload tags
      const urlTag = uploadTags.find((tag) => tag[0] === "url");
      if (urlTag && urlTag[1]) {
        setUploadedFileUrl(urlTag[1]);
        setUploadedFileName(file.name);
        fileCallbackOnUpload(urlTag[1]);
      } else {
        throw new Error("Failed to get upload URL");
      }
    } catch (error) {
      console.error("Error uploading encrypted file:", error);
      setFailureText("Failed to upload encrypted agreement. Please try again.");
      setShowFailureModal(true);
    } finally {
      setIsUploading(false);
      // Reset the input
      event.target.value = "";
    }
  };

  return (
    <>
      <div className="w-full">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          style={{ display: "none" }}
          id="encrypted-agreement-upload"
        />
        <div className="space-y-2">
          <Button
            as="label"
            htmlFor="encrypted-agreement-upload"
            className={`w-full cursor-pointer ${WHITEBUTTONCLASSNAMES}`}
            isLoading={isUploading}
            disabled={isUploading}
          >
            {isUploading ? "Encrypting and uploading..." : children}
          </Button>

          {uploadedFileUrl && (
            <div className="space-y-2 text-sm font-medium text-green-600">
              ✓ Encrypted agreement uploaded: {uploadedFileName}
            </div>
          )}
        </div>
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
