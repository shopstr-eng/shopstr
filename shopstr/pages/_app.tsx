import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";

import { NextUIProvider } from "@nextui-org/react";

function App({ Component, pageProps }: AppProps) {
  return (
    <div className="bg-gray-50 h-screen justify-center items-center w-screen mx-auto">
      <NextUIProvider>
        <Component {...pageProps} />
      </NextUIProvider>
    </div>
  );
}

export default App;
