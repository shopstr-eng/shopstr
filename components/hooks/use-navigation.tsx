"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

const useNavigation = () => {
  const pathname = usePathname();
  const [isHomeActive, setIsHomeActive] = useState(false);
  const [isMessagesActive, setIsMessagesActive] = useState(false);
  const [isWalletActive, setIsWalletActive] = useState(false);
  const [isMyListingsActive, setIsMyListingsActive] = useState(false);
  const [isProfileActive, setIsProfileActive] = useState(false);

  useEffect(() => {
    setIsHomeActive(false);
    setIsMessagesActive(false);
    setIsWalletActive(false);
    setIsMyListingsActive(false);
    setIsProfileActive(false);

    switch (pathname) {
      case "/marketplace":
        setIsHomeActive(true);
        break;
      case "/orders":
        setIsMessagesActive(true);
        break;
      case "/wallet":
        setIsWalletActive(true);
        break;
      case "/my-listings":
        setIsMyListingsActive(true);
        break;
      case "/settings":
        setIsProfileActive(true);
        break;
      default:
        // Handle any other cases here
        break;
    }
  }, [pathname]);

  return {
    isHomeActive,
    isMessagesActive,
    isWalletActive,
    isMyListingsActive,
    isProfileActive,
  };
};

export default useNavigation;
