import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useRouter } from "next/router";
import Navbar from "./components/navbar";

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLoginPage = router.pathname === "/";
  const isKeyPage = router.pathname === "/keys";

  return (
    <div className="xl:w-full h-full px-2 md:py-4 md:px-8">
      {isLoginPage || isKeyPage ? null : <Navbar />}
      <Component {...pageProps} />
    </div>
  );
}

export default App;
