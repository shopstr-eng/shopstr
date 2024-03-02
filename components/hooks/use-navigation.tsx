"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

const useNavigation = () => {
  const pathname = usePathname();
  const [isHomeActive, setIsHomeActive] = useState(false);
  const [isMessagesActive, setIsMessagesActive] = useState(false);
  const [isWalletActive, setIsWalletActive] = useState(false);
  const [isMetricsActive, setIsMetricsActive] = useState(false);
  const [isProfileActive, setIsProfileActive] = useState(false);

  useEffect(() => {
    setIsHomeActive(false);
    setIsMessagesActive(false);
    setIsWalletActive(false);
    setIsMetricsActive(false);
    setIsProfileActive(false);

    switch (pathname) {
      case "/":
        setIsHomeActive(true);
        break;
      case "/messages":
        setIsMessagesActive(true);
        break;
      case "/wallet":
        setIsWalletActive(true);
        break;
      case "/metrics":
        setIsMetricsActive(true);
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
    isMetricsActive,
    isProfileActive,
  };
};

export default useNavigation;
