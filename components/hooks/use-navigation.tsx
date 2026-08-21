"use client";

import { usePathname } from "next/navigation";

const useNavigation = () => {
  const pathname = usePathname();
  const isCommunitiesActive = pathname?.startsWith("/communities") ?? false;
  const isHomeActive = pathname === "/marketplace";
  const isMessagesActive = pathname === "/orders";
  const isWalletActive = pathname === "/wallet";
  const isMyListingsActive = pathname === "/my-listings";
  const isProfileActive = pathname === "/settings";
  const isCartActive = pathname === "/cart";

  return {
    isHomeActive,
    isMessagesActive,
    isWalletActive,
    isMyListingsActive,
    isProfileActive,
    isCommunitiesActive,
    isCartActive,
  };
};

export default useNavigation;
