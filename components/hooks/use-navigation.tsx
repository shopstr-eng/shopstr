'use client';

import { useEffect, useState } from 'react';

import { usePathname } from 'next/navigation';

const useNavigation = () => {
  const pathname = usePathname();
  const [isHomeActive, setIsHomeActive] = useState(false);
  const [isMessagesActive, setIsMessagesActive] = useState(false);
  const [isMetricsActive, setIsMetricsActive] = useState(false);
  const [isProfileActive, setIsProfileActive] = useState(false);

  useEffect(() => {
    setIsHomeActive(false);
    setIsMessagesActive(false);
    setIsMetricsActive(false);
    setIsProfileActive(false);

    switch (pathname) {
      case '/':
        setIsHomeActive(true);
        break;
      case '/messages':
        setIsMessagesActive(true);
        break;
      case '/metrics':
        setIsMetricsActive(true);
        break;
      case '/profile':
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
    isMetricsActive,
    isProfileActive,
  };
};

export default useNavigation;
