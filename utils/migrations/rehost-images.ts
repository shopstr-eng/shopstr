import {
  blossomUpload,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import type { ProductFormValues } from "@/utils/types/types";

export interface ImageRehostProgress {
  total: number;
  done: number;
  currentUrl: string;
}

export interface ImageRehostResult {
  values: ProductFormValues;
  warnings: string[];
}

/**
 * Walks a listing's `image` tags, downloads each remote image, re-uploads it
 * to the user's configured Blossom servers and replaces the URL in-place. If
 * an upload fails the original URL is kept and a warning is recorded so the
 * seller can fix it after migration.
 */
export async function rehostListingImages(
  values: ProductFormValues,
  signer: NostrSigner,
  productTitle: string,
  onProgress?: (progress: ImageRehostProgress) => void
): Promise<ImageRehostResult> {
  const warnings: string[] = [];
  const blossomServers = getLocalStorageData().blossomServers || [];

  const imageTagIndexes: number[] = [];
  values.forEach((tag, idx) => {
    if (tag[0] === "image" && typeof tag[1] === "string") {
      imageTagIndexes.push(idx);
    }
  });

  if (imageTagIndexes.length === 0) {
    return { values, warnings };
  }

  if (blossomServers.length === 0) {
    warnings.push(
      `"${productTitle}": no Blossom media server is configured, so images are still hosted on Shopify and will break if the original URLs go offline. Configure a media server in Settings → Preferences and re-run the migration to fix this.`
    );
    return { values, warnings };
  }

  const newValues: ProductFormValues = values.map((t) => [...t]);
  const total = imageTagIndexes.length;
  let done = 0;

  for (const idx of imageTagIndexes) {
    const url = newValues[idx]![1] as string;
    onProgress?.({ total, done, currentUrl: url });

    try {
      const file = await fetchRemoteImageAsFile(url);
      const tags = await blossomUpload(file, true, signer, blossomServers);
      const urlTag = tags.find((t) => t[0] === "url");
      const newUrl = urlTag?.[1];
      if (newUrl) {
        newValues[idx]![1] = newUrl;
      } else {
        warnings.push(
          `"${productTitle}": media server did not return a URL for ${shortUrl(url)}, kept the original Shopify link.`
        );
      }
    } catch (err) {
      console.error("Failed to rehost image", url, err);
      const reason = err instanceof Error ? err.message : "unknown error";
      warnings.push(
        `"${productTitle}": couldn't re-upload ${shortUrl(url)} (${reason}). Kept the original Shopify link — replace it manually if Shopify becomes unavailable.`
      );
    }

    done += 1;
    onProgress?.({ total, done, currentUrl: url });
  }

  return { values: newValues, warnings };
}

async function fetchRemoteImageAsFile(url: string): Promise<File> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error(
      blob.type
        ? `unexpected content type ${blob.type}`
        : "response was not an image"
    );
  }
  const filename = guessFilename(url, blob.type);
  return new File([blob], filename, { type: blob.type });
}

function guessFilename(url: string, mime: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && last.includes(".")) return last;
    const ext = mime.split("/")[1] || "jpg";
    return `shopify-image.${ext}`;
  } catch {
    const ext = mime.split("/")[1] || "jpg";
    return `shopify-image.${ext}`;
  }
}

function shortUrl(url: string): string {
  if (url.length <= 60) return url;
  return url.slice(0, 30) + "…" + url.slice(-25);
}
