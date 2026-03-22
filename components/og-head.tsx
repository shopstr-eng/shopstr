import Head from "next/head";

export type OgMetaProps = {
  title: string;
  description: string;
  image: string;
  url: string;
};

const BASE_URL = "https://milk.market";

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
      <meta property="twitter:domain" content="milk.market" />
      <meta property="twitter:url" content={absoluteUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />
    </Head>
  );
}

export const DEFAULT_OG: OgMetaProps = {
  title: "Milk Market - Farm-Fresh Dairy Direct from Local Farmers",
  description:
    "Buy farm-fresh, raw milk and dairy products direct from local farmers. Connecting consumers to trusted dairy producers with sovereignty and community in mind.",
  image: "/milk-market.png",
  url: "/",
};
