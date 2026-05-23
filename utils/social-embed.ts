import { StorefrontSocialPostPlatform } from "@/utils/types/types";

export interface SocialEmbedInfo {
  src: string;
  aspectRatio: string;
  allow?: string;
  allowFullScreen?: boolean;
  scrolling?: "yes" | "no" | "auto";
  sandbox?: string;
}

function safeUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

function getYouTubeEmbed(url: string): SocialEmbedInfo | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || null;
  } else if (
    hostMatches(host, "youtube.com") ||
    hostMatches(host, "youtube-nocookie.com")
  ) {
    if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v");
    } else {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        parts[0] === "shorts" ||
        parts[0] === "embed" ||
        parts[0] === "live" ||
        parts[0] === "v"
      ) {
        videoId = parts[1] || null;
      }
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return null;

  return {
    src: `https://www.youtube-nocookie.com/embed/${videoId}`,
    aspectRatio: "16 / 9",
    allow:
      "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    allowFullScreen: true,
  };
}

function getTwitterEmbed(url: string): SocialEmbedInfo | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  if (
    host !== "twitter.com" &&
    host !== "x.com" &&
    host !== "mobile.twitter.com"
  ) {
    return null;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  const statusIdx = parts.findIndex((p) => p === "status" || p === "statuses");
  if (statusIdx === -1) return null;
  const tweetId = parts[statusIdx + 1];
  if (!tweetId || !/^\d{6,}$/.test(tweetId)) return null;
  return {
    src: `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true`,
    aspectRatio: "3 / 4",
    allowFullScreen: true,
    scrolling: "no",
  };
}

function getInstagramEmbed(url: string): SocialEmbedInfo | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "instagram.com" && host !== "instagr.am") return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const kindIdx = parts.findIndex(
    (p) => p === "p" || p === "reel" || p === "tv"
  );
  if (kindIdx === -1) return null;
  const kind = parts[kindIdx];
  const id = parts[kindIdx + 1];
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return {
    src: `https://www.instagram.com/${kind}/${id}/embed/`,
    aspectRatio: "1 / 1.4",
    scrolling: "no",
    allowFullScreen: true,
  };
}

function getTikTokEmbed(url: string): SocialEmbedInfo | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  if (!hostMatches(host, "tiktok.com")) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const videoIdx = parts.findIndex((p) => p === "video");
  let videoId: string | null = null;
  if (videoIdx !== -1) {
    videoId = parts[videoIdx + 1] || null;
  } else if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return null;
  }
  if (!videoId || !/^\d{6,}$/.test(videoId)) return null;
  return {
    src: `https://www.tiktok.com/embed/v2/${videoId}`,
    aspectRatio: "9 / 16",
    allowFullScreen: true,
    scrolling: "no",
  };
}

function getFacebookEmbed(url: string): SocialEmbedInfo | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  if (!hostMatches(host, "facebook.com") && host !== "fb.watch") return null;
  const isVideo =
    parsed.pathname.includes("/videos/") ||
    parsed.pathname.startsWith("/watch") ||
    host === "fb.watch";
  const plugin = isVideo ? "video.php" : "post.php";
  const encoded = encodeURIComponent(url);
  return {
    src: `https://www.facebook.com/plugins/${plugin}?href=${encoded}&show_text=true&width=500`,
    aspectRatio: isVideo ? "16 / 9" : "3 / 4",
    scrolling: "no",
    allowFullScreen: true,
    allow: "encrypted-media; clipboard-write; picture-in-picture; web-share",
  };
}

function getTelegramEmbed(url: string): SocialEmbedInfo | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "t.me" && host !== "telegram.me") return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const channel = parts[0];
  const postId = parts[1];
  if (!channel || !postId) return null;
  if (!/^[A-Za-z0-9_]+$/.test(channel) || !/^\d+$/.test(postId)) return null;
  const embedUrl = new URL(`https://t.me/${channel}/${postId}`);
  embedUrl.searchParams.set("embed", "1");
  return {
    src: embedUrl.toString(),
    aspectRatio: "3 / 4",
    scrolling: "no",
  };
}

const RESOLVERS: Record<
  StorefrontSocialPostPlatform,
  ((url: string) => SocialEmbedInfo | null) | null
> = {
  youtube: getYouTubeEmbed,
  x: getTwitterEmbed,
  instagram: getInstagramEmbed,
  tiktok: getTikTokEmbed,
  facebook: getFacebookEmbed,
  telegram: getTelegramEmbed,
  website: null,
  other: null,
};

const ALL_RESOLVERS: ((url: string) => SocialEmbedInfo | null)[] = [
  getYouTubeEmbed,
  getTwitterEmbed,
  getInstagramEmbed,
  getTikTokEmbed,
  getFacebookEmbed,
  getTelegramEmbed,
];

export function getSocialEmbed(
  platform: StorefrontSocialPostPlatform,
  url: string
): SocialEmbedInfo | null {
  if (!url) return null;
  const resolver = RESOLVERS[platform];
  if (resolver) {
    const direct = resolver(url);
    if (direct) return direct;
  }
  for (const r of ALL_RESOLVERS) {
    const info = r(url);
    if (info) return info;
  }
  return null;
}
