"use client";

import React, { useContext, useEffect, useState } from "react";
import MyListingsPage from "./my-listings";
import ProductForm from "../product-form";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Button,
} from "@nextui-org/react";
import { WHITEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const MyListingsFeed = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showModal, setShowModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordStorageKey, setPasswordStorageKey] = useState<string>("");
  const { isLoggedIn } = useContext(SignerContext);

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
    if (!searchParams || !isLoggedIn) return;

    if (searchParams.has("addNewListing")) {
      if (isAuthenticated) {
        setShowModal(true);
      } else {
        setShowPasswordModal(true);
      }
    }
  }, [searchParams, isLoggedIn, isAuthenticated]);

  // Auto-close password modal if user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && showPasswordModal) {
      setShowPasswordModal(false);
      setPasswordInput("");
      setPasswordError("");
      setShowModal(true);
    }
  }, [isAuthenticated, showPasswordModal]);

  const handleProductModalToggle = () => {
    setShowModal(!showModal);
    router.push("");
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
        setShowModal(true);
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
    router.push("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePasswordSubmit();
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-screen flex-1">
        <MyListingsPage />
      </div>

      <ProductForm
        showModal={showModal}
        handleModalToggle={handleProductModalToggle}
      />

      <Modal
        backdrop="blur"
        isOpen={showPasswordModal}
        onClose={handlePasswordModalClose}
        classNames={{
          body: "py-6 bg-dark-fg",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46] bg-dark-fg rounded-t-lg",
          footer: "border-t-[1px] border-[#292f46] bg-dark-fg rounded-b-lg",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="md"
        isDismissable={true}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-dark-text">
            Enter Listing Password
          </ModalHeader>
          <ModalBody>
            <Input
              className="text-dark-text"
              autoFocus
              variant="flat"
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
              <div className="mt-2 text-sm text-red-500">{passwordError}</div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              color="danger"
              variant="light"
              onClick={handlePasswordModalClose}
            >
              Cancel
            </Button>
            <Button
              className={`bg-gradient-to-tr text-white shadow-lg ${WHITEBUTTONCLASSNAMES}`}
              onClick={handlePasswordSubmit}
              isDisabled={!passwordInput.trim()}
            >
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default MyListingsFeed;
