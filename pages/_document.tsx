import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head>
        <link rel="favicon" href="/shopstr.ico" />
        <link rel="icon" href="/shopstr.ico" />
        <link rel="apple-icon" href="/shopstr.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#111111" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
