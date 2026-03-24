/* eslint-disable @next/next/no-img-element */

import { useContext, useEffect, useState } from "react";
import type React from "react";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
} from "@nextui-org/react";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { CommunityContext } from "@/utils/context/context";
import {
  createOrUpdateCommunity,
  deleteEvent,
  finalizeAndSendNostrEvent,
} from "@/utils/nostr/nostr-helper-functions";
import CreateCommunityForm from "@/components/communities/CreateCommunityForm";
import { Community } from "@/utils/types/types";
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import FailureModal from "@/components/utility-components/failure-modal";
import SuccessModal from "@/components/utility-components/success-modal";

// Dev mode flag for localhost
const IS_DEV_MODE = process.env.NODE_ENV === "development";

const CommunityManagementPage = () => {
  const { signer, pubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const { communities, isLoading } = useContext(CommunityContext);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [communityToEdit, setCommunityToEdit] = useState<
    Community | "new" | null
  >(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordStorageKey, setPasswordStorageKey] = useState<string>("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [failureMessage, setFailureMessage] = useState("");

  useEffect(() => {
    const fetchPasswordStorageKey = async () => {
      try {
        const response = await fetch("/api/validate-password-auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const data = await response.json();
        if (data.value) {
          setPasswordStorageKey(data.value);
          const storedAuth = localStorage.getItem(data.value);
          if (storedAuth === "true") {
            setIsAuthenticated(true);
          }
        }
      } catch (error) {
        console.error("Failed to fetch password storage key:", error);
      }
    };

    fetchPasswordStorageKey();
  }, []);

  useEffect(() => {
    if (pubkey && communities.size > 0) {
      const userCommunities = Array.from(communities.values()).filter(
        (c) => c.pubkey === pubkey
      );
      setMyCommunities(userCommunities);
    }
  }, [pubkey, communities]);

  const handleSave = async (data: {
    name: string;
    description: string;
    image: string;
    d: string;
  }) => {
    if (!signer || !nostr || !pubkey) {
      setFailureMessage(
        "You must be logged in to create or update a community."
      );
      setShowFailureModal(true);
      return;
    }
    try {
      const communityEvent = await createOrUpdateCommunity(signer, nostr, {
        ...data,
        moderators: [pubkey], // Add creator as a moderator
      });

      await finalizeAndSendNostrEvent(signer!, nostr!, communityEvent);
      setSuccessMessage(
        "Community saved! It may take a few moments to appear."
      );
      setShowSuccessModal(true);
      setCommunityToEdit(null);
    } catch (error) {
      console.error("Failed to save community", error);
      setFailureMessage("Failed to save community.");
      setShowFailureModal(true);
    }
  };

  const handleDelete = async (communityId: string) => {
    if (!signer || !nostr) return;

    const isConfirmed = window.confirm(
      "Are you sure you want to delete this community? This action cannot be undone."
    );

    if (isConfirmed) {
      try {
        await deleteEvent(nostr, signer, [communityId]);
        setSuccessMessage(
          "Community deletion request sent. It may take a few moments to disappear from relays."
        );
        setShowSuccessModal(true);
        // Optimistically remove from the local list
        setMyCommunities((prev) => prev.filter((c) => c.id !== communityId));
      } catch (error) {
        console.error("Failed to delete community", error);
        setFailureMessage("Failed to delete community.");
        setShowFailureModal(true);
      }
    }
  };

  const handleCreateNewCommunity = () => {
    if (IS_DEV_MODE || isAuthenticated) {
      setCommunityToEdit("new");
    } else {
      setShowPasswordModal(true);
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      const response = await fetch("/api/validate-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: passwordInput.trim() }),
      });

      const data = await response.json();

      if (data.valid) {
        setIsAuthenticated(true);
        if (passwordStorageKey) {
          localStorage.setItem(passwordStorageKey, "true");
        }
        setShowPasswordModal(false);
        setCommunityToEdit("new");
        setPasswordInput("");
        setPasswordError("");
      } else {
        setPasswordError("Incorrect password. Please try again.");
      }
    } catch (error) {
      setPasswordError("An error occurred. Please try again.");
    }
  };

  const handlePasswordModalClose = () => {
    setShowPasswordModal(false);
    setPasswordInput("");
    setPasswordError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePasswordSubmit();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white pt-24 md:pb-20">
      <div className="mx-auto h-full w-full px-4 lg:w-1/2 xl:w-2/5">
        <SettingsBreadCrumbs />

        {communityToEdit ? (
          // Neo-brutalist card container for form
          <div className="rounded-md border-4 border-black bg-white p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="mb-2 text-3xl font-bold text-black">
              {communityToEdit === "new"
                ? "Create Your Community"
                : `Editing: ${communityToEdit.name}`}
            </h2>
            <p className="mb-6 text-black/70">
              Create a space for your customers to gather and get updates.
            </p>
            <CreateCommunityForm
              existingCommunity={
                communityToEdit === "new" ? null : communityToEdit
              }
              onSave={handleSave}
              onCancel={() => setCommunityToEdit(null)}
            />
          </div>
        ) : (
          // Show the List of Communities
          <>
            <div className="mb-6 flex w-full items-center justify-between">
              <h2 className="text-3xl font-bold text-black">
                Your Communities
              </h2>
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={handleCreateNewCommunity}
              >
                Create New
              </Button>
            </div>

            {isLoading && myCommunities.length === 0 ? (
              <MilkMarketSpinner label="Loading your communities..." />
            ) : myCommunities.length > 0 ? (
              <div className="space-y-4">
                {myCommunities.map((community) => (
                  <div
                    key={community.id}
                    className="flex items-center justify-between rounded-md border-3 border-black bg-white p-4 shadow-neo"
                  >
                    <span className="text-lg font-bold text-black">
                      {community.name}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className={WHITEBUTTONCLASSNAMES}
                        onClick={() => setCommunityToEdit(community)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        className="transform rounded-md border-2 border-black bg-red-500 px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                        onClick={() => handleDelete(community.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border-4 border-black bg-white p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <p className="text-black/70">
                  You haven&apos;t created any communities yet.
                </p>
              </div>
            )}
          </>
        )}

        <Modal
          backdrop="blur"
          isOpen={showPasswordModal}
          onClose={handlePasswordModalClose}
          classNames={{
            body: "py-6 bg-white",
            backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
            header: "border-b-4 border-black bg-white rounded-t-md",
            footer: "border-t-4 border-black bg-white rounded-b-md",
            closeButton: "hover:bg-black/5 active:bg-white/10",
            wrapper: "items-center justify-center",
            base: "border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-md",
          }}
          scrollBehavior={"outside"}
          size="md"
          isDismissable={true}
        >
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1 text-xl font-bold text-black">
              Enter Seller Password
            </ModalHeader>
            <ModalBody>
              <Input
                className="text-black"
                classNames={{
                  input: "border-2 border-black",
                  inputWrapper:
                    "border-2 border-black shadow-neo bg-white rounded-md",
                }}
                autoFocus
                variant="bordered"
                label="Password"
                labelPlacement="inside"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={handleKeyDown}
                isInvalid={!!passwordError}
                errorMessage={passwordError}
              />
              {passwordError && (
                <div className="mt-2 text-sm font-semibold text-red-500">
                  {passwordError}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                className="transform rounded-md border-2 border-black bg-white px-4 py-2 font-bold text-black shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                onClick={handlePasswordModalClose}
              >
                Cancel
              </Button>
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={handlePasswordSubmit}
                isDisabled={!passwordInput.trim()}
              >
                Submit
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <SuccessModal
          bodyText={successMessage}
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            setSuccessMessage("");
          }}
        />

        <FailureModal
          bodyText={failureMessage}
          isOpen={showFailureModal}
          onClose={() => {
            setShowFailureModal(false);
            setFailureMessage("");
          }}
        />
      </div>
    </div>
  );
};

export default CommunityManagementPage;
