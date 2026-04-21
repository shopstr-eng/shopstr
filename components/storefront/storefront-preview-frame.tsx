import Head from "next/head";
import { useMemo } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";

const GOOGLE_FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
  "Raleway",
  "Nunito",
  "Oswald",
  "Source Sans 3",
  "PT Serif",
  "Bitter",
  "Crimson Text",
];

function getFontFormat(url: string): string {
  if (url.includes(".woff2")) return "woff2";
  if (url.includes(".woff")) return "woff";
  if (url.includes(".otf")) return "opentype";
  if (url.includes(".ttf")) return "truetype";
  return "woff2";
}

interface StorefrontPreviewFrameProps {
  colors: StorefrontColorScheme;
  fontHeading?: string;
  fontBody?: string;
  customFontHeadingUrl?: string;
  customFontHeadingName?: string;
  customFontBodyUrl?: string;
  customFontBodyName?: string;
  children: React.ReactNode;
  className?: string;
  maxWidth?: number;
}

export default function StorefrontPreviewFrame({
  colors,
  fontHeading,
  fontBody,
  customFontHeadingUrl,
  customFontHeadingName,
  customFontBodyUrl,
  customFontBodyName,
  children,
  className,
  maxWidth,
}: StorefrontPreviewFrameProps) {
  const googleFontsUrl = useMemo(() => {
    const fonts = new Set<string>();
    if (
      fontHeading &&
      !customFontHeadingUrl &&
      GOOGLE_FONT_OPTIONS.includes(fontHeading)
    )
      fonts.add(fontHeading);
    if (
      fontBody &&
      !customFontBodyUrl &&
      GOOGLE_FONT_OPTIONS.includes(fontBody)
    )
      fonts.add(fontBody);
    if (customFontHeadingUrl || customFontBodyUrl) fonts.add("Poppins");
    if (fonts.size === 0) return null;
    const families = Array.from(fonts)
      .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
      .join("&");
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }, [fontHeading, fontBody, customFontHeadingUrl, customFontBodyUrl]);

  const customFontFaceCss = useMemo(() => {
    let css = "";
    if (customFontHeadingUrl) {
      const name =
        customFontHeadingName?.replace(/\.[^.]+$/, "") || "CustomHeading";
      const format = getFontFormat(customFontHeadingUrl);
      css += `@font-face { font-family: '${name}'; src: url('${customFontHeadingUrl}') format('${format}'); font-weight: 100 900; font-display: swap; }\n`;
    }
    if (customFontBodyUrl && customFontBodyUrl !== customFontHeadingUrl) {
      const name = customFontBodyName?.replace(/\.[^.]+$/, "") || "CustomBody";
      const format = getFontFormat(customFontBodyUrl);
      css += `@font-face { font-family: '${name}'; src: url('${customFontBodyUrl}') format('${format}'); font-weight: 100 900; font-display: swap; }\n`;
    }
    return css;
  }, [
    customFontHeadingUrl,
    customFontHeadingName,
    customFontBodyUrl,
    customFontBodyName,
  ]);

  const resolvedHeadingFont = customFontHeadingUrl
    ? `'${customFontHeadingName?.replace(/\.[^.]+$/, "") || "CustomHeading"}', 'Poppins', sans-serif`
    : fontHeading
      ? `'${fontHeading}', sans-serif`
      : "";
  const resolvedBodyFont = customFontBodyUrl
    ? `'${customFontBodyName?.replace(/\.[^.]+$/, "") || "CustomBody"}', 'Poppins', sans-serif`
    : fontBody
      ? `'${fontBody}', sans-serif`
      : "";

  const themedCss = `
    .sf-preview-frame .font-heading { font-family: var(--font-heading, inherit); }
    .sf-preview-frame .font-body { font-family: var(--font-body, inherit); }
    .sf-preview-frame .bg-primary-yellow { background-color: var(--sf-primary) !important; }
    .sf-preview-frame .bg-primary-blue { background-color: var(--sf-secondary) !important; }
    .sf-preview-frame .text-primary-blue { color: var(--sf-secondary) !important; }
    .sf-preview-frame .border-primary-yellow { border-color: var(--sf-primary) !important; }
    .sf-preview-frame .border-black { border-color: var(--sf-secondary) !important; }
    .sf-preview-frame .bg-white { background-color: var(--sf-bg) !important; }
    .sf-preview-frame .text-black { color: var(--sf-text) !important; }
  `;

  const style = {
    "--sf-primary": colors.primary,
    "--sf-secondary": colors.secondary,
    "--sf-accent": colors.accent,
    "--sf-bg": colors.background,
    "--sf-text": colors.text,
    ...(resolvedHeadingFont ? { "--font-heading": resolvedHeadingFont } : {}),
    ...(resolvedBodyFont ? { "--font-body": resolvedBodyFont } : {}),
    backgroundColor: "var(--sf-bg)",
    color: "var(--sf-text)",
  } as React.CSSProperties;

  if (maxWidth) {
    return (
      <>
        <Head>
          {googleFontsUrl && <link href={googleFontsUrl} rel="stylesheet" />}
          {customFontFaceCss && <style>{customFontFaceCss}</style>}
          <style>{themedCss}</style>
        </Head>
        <div className="flex w-full justify-center bg-gray-100 py-4">
          <div
            className={`sf-preview-frame storefront-themed overflow-hidden rounded border border-gray-300 shadow-sm ${className || ""}`}
            style={{ ...style, width: "100%", maxWidth }}
          >
            {children}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        {googleFontsUrl && <link href={googleFontsUrl} rel="stylesheet" />}
        {customFontFaceCss && <style>{customFontFaceCss}</style>}
        <style>{themedCss}</style>
      </Head>
      <div
        className={`sf-preview-frame storefront-themed ${className || ""}`}
        style={style}
      >
        {children}
      </div>
    </>
  );
}
