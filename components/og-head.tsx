import Head from "next/head";

export type OgMetaProps = {
  title: string;
  description: string;
  image: string;
  url: string;
};

const BASE_URL = "https://shopstr.market";

function ensureAbsoluteUrl(url: string, base: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function OgHead({
  title,
  description,
  image,
  url,
}: OgMetaProps) {
  const absoluteImage = ensureAbsoluteUrl(image, BASE_URL);
  const absoluteUrl = ensureAbsoluteUrl(url, BASE_URL);

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={absoluteUrl} />
      <meta property="og:url" content={absoluteUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:domain" content="shopstr.market" />
      <meta property="twitter:url" content={absoluteUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />
    </Head>
  );
}

export const DEFAULT_OG: OgMetaProps = {
  title: "Shopstr | Bitcoin-Native Nostr Marketplace | Shop Freely",
  description:
    "Shopstr is a global, permissionless marketplace built on Nostr. Buy and sell goods with Bitcoin and Lightning — no KYC, no censorship, no middlemen.",
  image: "/shopstr-2000x2000.png",
  url: "/",
};
