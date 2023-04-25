import 'tailwindcss/tailwind.css';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div className="bg-gray-50 h-screen justify-center items-center w-screen mx-auto">
      <Component {...pageProps} />
    </div>
  );
};

export default MyApp;
