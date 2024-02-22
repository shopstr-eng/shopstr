import 'tailwindcss/tailwind.css';
import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  ProfileMapContext,
  ProfileContextInterface,
  ProductContext,
  ProductContextInterface,
  ChatsContextInterface,
  ChatsContext,
  ChatsMap,
} from './context';
import {
  getLocalStorageData,
  LocalStorageInterface,
} from '../components/utility/nostr-helper-functions';
import { NextUIProvider } from '@nextui-org/react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import {
  fetchAllPosts,
  fetchChatsAndMessages,
  fetchProfile,
} from './api/nostr/fetch-service';
import { NostrEvent } from './types';
import MaxWidthWrapper from '@/components/max-width-wrapper';
import BottomNav from '@/components/nav-bottom';
import SideNav from '@/components/nav-side';

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isSignInPage = router.pathname === '/sign-in';
  const isKeyPage = router.pathname === '/keys';
  const [localStorageValues, setLocalStorageValues] =
    useState<LocalStorageInterface>(getLocalStorageData());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
      addNewlyCreatedProductEvent: (productEvent: any) => {
        setProductContext((productContext) => {
          let productEvents = [...productContext.productEvents, productEvent];
          return {
            productEvents: productEvents,
            isLoading: false,
            addNewlyCreatedProductEvent:
              productContext.addNewlyCreatedProductEvent,
            removeDeletedProductEvent: productContext.removeDeletedProductEvent,
          };
        });
      },
      removeDeletedProductEvent: (productId: string) => {
        setProductContext((productContext) => {
          let productEvents = [...productContext.productEvents].filter(
            (event) => event.id !== productId,
          );
          return {
            productEvents: productEvents,
            isLoading: false,
            addNewlyCreatedProductEvent:
              productContext.addNewlyCreatedProductEvent,
            removeDeletedProductEvent: productContext.removeDeletedProductEvent,
          };
        });
      },
    },
  );
  const [profileContext, setProfileContext] = useState<ProfileContextInterface>(
    {
      profileData: new Map(),
      isLoading: true,
    },
  );

  const [chatsContext, setChatsContext] = useState<ChatsContextInterface>({
    chatsMap: new Map(),
    isLoading: true,
  });

  const editProductContext = (
    productEvents: NostrEvent[],
    isLoading: boolean,
  ) => {
    setProductContext({
      productEvents: productEvents,
      isLoading: isLoading,
      addNewlyCreatedProductEvent: productContext.addNewlyCreatedProductEvent,
      removeDeletedProductEvent: productContext.removeDeletedProductEvent,
    });
  };

  const editProfileContext = (
    profileData: Map<string, any>,
    isLoading: boolean,
  ) => {
    setProfileContext({ profileData, isLoading });
  };

  const editChatContext = (chatsMap: ChatsMap, isLoading: boolean) => {
    setChatsContext({ chatsMap, isLoading });
  };

  /** FETCH initial PRODUCTS and PROFILES **/
  useEffect(() => {
    const relays = localStorageValues.relays;
    const decryptedNpub = localStorageValues.decryptedNpub;
    async function fetchData() {
      try {
        let pubkeysToFetchProfilesFor: string[] = [];
        let { profileSetFromProducts } = await fetchAllPosts(
          relays,
          editProductContext,
        );
        pubkeysToFetchProfilesFor = [...profileSetFromProducts];
        let { profileSetFromChats } = await fetchChatsAndMessages(
          relays,
          decryptedNpub,
          editChatContext,
        );
        pubkeysToFetchProfilesFor = [
          decryptedNpub as string,
          ...pubkeysToFetchProfilesFor,
          ...profileSetFromChats,
        ];
        let { profileMap } = await fetchProfile(
          relays,
          pubkeysToFetchProfilesFor,
          editProfileContext,
        );
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }
    if (relays) fetchData(); // Call the async function immediately
  }, [localStorageValues.relays]);

  return (
    <ProductContext.Provider value={productContext}>
      <ProfileMapContext.Provider value={profileContext}>
        <ChatsContext.Provider value={chatsContext}>
          <NextUIProvider>
            <NextThemesProvider
              attribute="class"
              forcedTheme={Component.theme || undefined}
            >
              <>
                <MaxWidthWrapper>
                  <div className="flex">
                    <SideNav />
                    <Component {...pageProps} />
                  </div>
                </MaxWidthWrapper>
                <BottomNav />
              </>
            </NextThemesProvider>
          </NextUIProvider>
        </ChatsContext.Provider>
      </ProfileMapContext.Provider>
    </ProductContext.Provider>
  );
}

export default App;
