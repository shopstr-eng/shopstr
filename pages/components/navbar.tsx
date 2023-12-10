import React, { useState, useEffect } from "react";
import {
  HomeIcon,
  EnvelopeOpenIcon,
  WalletIcon,
  GlobeAltIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";

type NavbarProps = {
  darkMode: boolean;
  handleDarkModeToggle: (darkMode: boolean) => void;
};

const DarkModeToggle = ({ darkMode, handleDarkModeToggle }: NavbarProps) => {
  return (
    <div>
      {darkMode ? (
        <MoonIcon
          className="dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700"
          onClick={() => handleDarkModeToggle(false)}
        />
      ) : (
        <SunIcon
          className="dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700"
          onClick={() => handleDarkModeToggle(true)}
        />
      )}
    </div>
  );
};

const Navbar = ({ darkMode, handleDarkModeToggle }: NavbarProps) => {
  const router = useRouter();
  const [signIn, setSignIn] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const signInType = localStorage.getItem("signIn");
      if (signInType) {
        setSignIn(signInType);
      }
    }
  }, []);

  return (
    <div className="dark:bg-main-dark-bg bg-main-light-bg absolute z-20 flex w-full flex-col px-3 pb-2">
      <div className="flex h-[40px] flex-row justify-between">
        <h1
          className="text-shopstr-purple cursor-pointer text-3xl font-bold hover:text-purple-700"
          onClick={() => router.push("/")}
        >
          Shopstr
        </h1>
        <div className="mt-2 flex space-x-2">
          <DarkModeToggle
            darkMode={darkMode}
            handleDarkModeToggle={handleDarkModeToggle}
          />
          <HomeIcon
            className={`dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700 ${
              router.pathname === "/" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/")}
          />
          <EnvelopeOpenIcon
            className={`dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700 ${
              router.pathname === "/direct-messages" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/direct-messages")}
          />
          <WalletIcon
            className={`dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700 ${
              router.pathname === "/wallet" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/wallet")}
          />
          <GlobeAltIcon
            className={`dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700 ${
              router.pathname === "/relays" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/relays")}
          />
          {!signIn && (
            <ArrowLeftOnRectangleIcon
              className="dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700"
              onClick={() => {
                router.push("/sign-in");
              }}
            />
          )}
          {signIn && (
            <ArrowRightOnRectangleIcon
              className="dark:text-main-dark-text dark:hover:text-accent-dark-text h-6 w-6 cursor-pointer hover:text-purple-700"
              onClick={() => {
                localStorage.removeItem("npub");
                localStorage.removeItem("signIn");
                localStorage.removeItem("encryptedPrivateKey");
                router.push("/");
                let successStr = "Signed out!";
                alert(successStr);
                router.reload();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
