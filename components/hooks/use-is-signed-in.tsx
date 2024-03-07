"use client";

import { useEffect, useState } from "react";

import { getLocalStorageData } from "../utility/nostr-helper-functions";

const useIsSignedIn = () => {
  const { userNPub } = getLocalStorageData();
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    setIsSignedIn(false);

    if (userNPub) {
      setIsSignedIn(true);
    }
  }, [userNPub]);

  return isSignedIn;
};

export default useIsSignedIn;
