'use client';

import React, { useContext, useEffect, useState } from 'react';

import Link from 'next/link';

import useNavigation from '@/components/hooks/use-navigation';
import useScrollingEffect from '@/components/hooks/use-scroll';

// import { Icon } from '@iconify/react';
import {
  HomeIcon,
  EnvelopeOpenIcon,
  BuildingLibraryIcon,
  GlobeAltIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
  SunIcon,
  MoonIcon,
  ChartBarIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@nextui-org/react';
import { countNumberOfUnreadMessagesFromChatsContext } from '@/pages/messages/utils';
import { Icon } from '@tremor/react';
import { ChatsContext } from '@/pages/context';
import { db } from '../pages/api/nostr/cache-service';

import { useLiveQuery } from 'dexie-react-hooks';
import { getLocalStorageData } from './utility/nostr-helper-functions';
import { useRouter } from 'next/router';
import SignInModal from './sign-in/SignInModal';

const BottomNav = () => {
  const { isHomeActive, isMessagesActive, isMetricsActive, isProfileActive } =
    useNavigation();
  const router = useRouter();

  const chatsContext = useContext(ChatsContext);

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  const [openSignInModal, setOpenSignInModal] = useState(false);
  let [count, setCount] = useState(0);

  const liveChatMessagesFromCache = useLiveQuery(
    async () => await db.table('chatMessages').toArray(),
  );
  useEffect(() => {
    const getUnreadMessages = async () => {
      let unreadMsgCount = await countNumberOfUnreadMessagesFromChatsContext(
        chatsContext.chatsMap,
      );
      setUnreadMsgCount(unreadMsgCount);
    };
    getUnreadMessages();
  }, [chatsContext, liveChatMessagesFromCache]);

  const handleRoute = (path: string) => {
    const loggedIn = getLocalStorageData().npub;

    if (loggedIn) {
      router.push(path);
    } else {
      setOpenSignInModal(true);
      setCount(++count);
    }
  };
  return (
    <div
      className={`fixed bottom-0 z-10 w-full border-0 bg-light-fg shadow-lg dark:bg-dark-fg sm:hidden`}
    >
      <div className="flex w-full flex-row items-center justify-evenly justify-items-stretch">
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => router.push('/')}
          >
            <HomeIcon
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isHomeActive
                  ? 'text-shopstr-purple-light dark:text-shopstr-yellow-light'
                  : ''
              }`}
            ></HomeIcon>
          </Button>
        </div>
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => handleRoute('messages')}
          >
            {unreadMsgCount > 0 && (
              <div className="absolute ml-3 flex h-3 w-fit items-center justify-center rounded-full bg-shopstr-purple-light px-1 py-2 font-bold text-light-bg dark:bg-shopstr-yellow-light dark:text-dark-bg">
                {unreadMsgCount}
              </div>
            )}
            <EnvelopeOpenIcon
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isMessagesActive
                  ? 'text-shopstr-purple-light dark:text-shopstr-yellow-light'
                  : ''
              }`}
            ></EnvelopeOpenIcon>
          </Button>
        </div>
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => handleRoute('/metrics')}
          >
            <ChartBarIcon
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isMetricsActive
                  ? 'text-shopstr-purple-light dark:text-shopstr-yellow-light'
                  : ''
              }`}
            ></ChartBarIcon>
          </Button>
        </div>{' '}
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => handleRoute('/profile')}
          >
            <UserIcon
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isProfileActive
                  ? 'text-shopstr-purple-light dark:text-shopstr-yellow-light'
                  : ''
              }`}
            ></UserIcon>
          </Button>
        </div>
      </div>
      <SignInModal opened={openSignInModal} some={count}></SignInModal>
    </div>
  );
};

export default BottomNav;