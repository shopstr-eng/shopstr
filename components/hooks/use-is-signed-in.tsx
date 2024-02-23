'use client';

import { useEffect, useState } from 'react';

import { getLocalStorageData } from '../utility/nostr-helper-functions';

const useIsSignedIn = () => {
  const { npub } = getLocalStorageData();
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    setIsSignedIn(false);

    if (npub) {
      setIsSignedIn(true);
    }
  }, [npub]);

  return isSignedIn;
};

export default useIsSignedIn;
