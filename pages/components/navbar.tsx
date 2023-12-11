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
import { useTheme } from "next-themes";

const DarkModeToggle = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      {theme === "dark" ? (
        <MoonIcon
          className="h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
          onClick={() => setTheme("light")}
        />
      ) : (
        <SunIcon
          className="h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
          onClick={() => setTheme("dark")}
        />
      )}
    </div>
  );
};

const Navbar = () => {
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
    <div className="absolute z-20 flex w-full flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
      <div className="flex h-[40px] flex-row justify-between">
        <h1
          className="cursor-pointer text-3xl font-bold text-shopstr-purple-light hover:text-purple-700 dark:text-shopstr-yellow-light"
          onClick={() => router.push("/")}
        >
          Shopstr
        </h1>
        <div className="mt-2 flex space-x-2">
          <HomeIcon
            className={`h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
              router.pathname === "/" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/")}
          />
          <EnvelopeOpenIcon
            className={`h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
              router.pathname === "/direct-messages" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/direct-messages")}
          />
          <WalletIcon
            className={`h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
              router.pathname === "/wallet" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/wallet")}
          />
          <GlobeAltIcon
            className={`h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
              router.pathname === "/relays" ? "text-purple-500" : ""
            }`}
            onClick={() => router.push("/relays")}
          />
          <DarkModeToggle />
          {!signIn && (
            <ArrowLeftOnRectangleIcon
              className="h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
              onClick={() => {
                router.push("/sign-in");
              }}
            />
          )}
          {signIn && (
            <ArrowRightOnRectangleIcon
              className="h-6 w-6 cursor-pointer hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
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
