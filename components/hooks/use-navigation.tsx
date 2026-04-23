"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

const useNavigation = () => {
  const pathname = usePathname();
  const [isHomeActive, setIsHomeActive] = useState(false);
  const [isMessagesActive, setIsMessagesActive] = useState(false);
  const [isWalletActive, setIsWalletActive] = useState(false);
  const [isProfileActive, setIsProfileActive] = useState(false);
  const [isCommunitiesActive, setIsCommunitiesActive] = useState(false);
  const [isCartActive, setIsCartActive] = useState(false);

  useEffect(() => {
    if (!pathname) return;
    setIsHomeActive(false);
    setIsMessagesActive(false);
    setIsWalletActive(false);
    setIsProfileActive(false);
    setIsCommunitiesActive(false);
    setIsCartActive(false);

    if (pathname.startsWith("/communities")) {
      setIsCommunitiesActive(true);
    } else {
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
        case "/settings":
          setIsProfileActive(true);
          break;
        case "/cart":
          setIsCartActive(true);
          break;
      }
    }
  }, [pathname]);

  return {
    isHomeActive,
    isMessagesActive,
    isWalletActive,
    isProfileActive,
    isCommunitiesActive,
    isCartActive,
  };
};

export default useNavigation;
