import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useRouter } from 'next/router';
import { HomeIcon, EnvelopeIcon, WalletIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLoginPage = router.pathname === "/";
  
  return (
    <div className="xl:w-full h-full bg-purple-500 py-1 px-2 md:py-8 md:px-16">
      {isLoginPage ? null : (
        <div className="flex flex-row justify-between">
          <h1 className="text-3xl font-bold text-yellow-100">
            Shopstr
          </h1>
          <div className="flex space-x-2">
            <HomeIcon
              className={`w-6 h-6 hover:text-purple-700 ${
                router.pathname === '/marketplace' ? 'text-yellow-100' : ''
              }`}
              onClick={() => router.push('/marketplace')}
            />
            <EnvelopeIcon
              className={`w-6 h-6 hover:text-purple-700 ${
                router.pathname === '/direct-messages' ? 'text-yellow-100' : ''
              }`}
              onClick={() => router.push('/direct-messages')}
            />
            <WalletIcon
              className={`w-6 h-6 hover:text-purple-700 ${
                router.pathname === '/wallet' ? 'text-yellow-100' : ''
              }`}
              onClick={() => router.push('/wallet')}
            />
            <GlobeAltIcon
              className={`w-6 h-6 hover:text-purple-700 ${
                router.pathname === '/profile' ? 'text-yellow-100' : ''
              }`}
              onClick={() => router.push('/relays')}
            />
          </div>
        </div>
      )}
      <Component {...pageProps} />
    </div>
  );
}

export default App;
