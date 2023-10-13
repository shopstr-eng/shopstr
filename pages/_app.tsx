import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useRouter } from "next/router";
import Navbar from "./components/navbar";

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLoginPage = router.pathname === "/";

  return (
    <div className="xl:w-full h-full bg-purple-500 px-2 md:py-4 md:px-8">
      {isLoginPage ? null : <Navbar />}
      <Component {...pageProps} />
    </div>
  );
}

export default App;
