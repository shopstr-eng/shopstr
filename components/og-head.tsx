import Head from "next/head";

export type OgMetaProps = {
  title: string;
  description: string;
  image: string;
  url: string;
  keywords?: string;
  locale?: string;
  locationRegion?: string;
  locationCity?: string;
  siteName?: string;
  type?: string;
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
  keywords,
  locale,
  locationRegion,
  locationCity,
  siteName,
  type,
}: OgMetaProps) {
  const absoluteImage = ensureAbsoluteUrl(image, BASE_URL);
  const absoluteUrl = ensureAbsoluteUrl(url, BASE_URL);
  const ogType = type || "website";
  const ogSiteName = siteName || "Milk Market";
  const ogLocale = locale || "en_US";

  const geoPlaceName = [locationCity, locationRegion]
    .filter(Boolean)
    .join(", ");

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={absoluteUrl} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content="index, follow" />

      <meta property="og:url" content={absoluteUrl} />
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:site_name" content={ogSiteName} />
      <meta property="og:locale" content={ogLocale} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:domain" content="milk.market" />
      <meta property="twitter:url" content={absoluteUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />

      {locationRegion && <meta name="geo.region" content={locationRegion} />}
      {locationCity && <meta name="geo.placename" content={locationCity} />}
      {geoPlaceName && <meta property="og:locality" content={geoPlaceName} />}
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
