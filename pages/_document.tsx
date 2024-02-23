import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="favicon" href="/shopstr.ico" />
        <link rel="icon" href="/shopstr.ico" />
        <link rel="apple-icon" href="/shopstr.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta
          name="description"
          content="Buy and sell anything, anywhere, anytime."
        />

        <meta property="og:url" content="https://shopstr.store" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Shopstr" />
        <meta
          property="og:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta property="og:image" content="/shopstr.png" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="shopstr.store" />
        <meta property="twitter:url" content="https://shopstr.store" />
        <meta name="twitter:title" content="Shopstr" />
        <meta
          name="twitter:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta name="twitter:image" content="/shopstr.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
