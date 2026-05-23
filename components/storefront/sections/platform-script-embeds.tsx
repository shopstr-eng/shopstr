import { ReactNode } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";
import ScriptEmbed from "./script-embed";

declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process: () => void;
      };
    };
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement) => void;
      };
    };
    FB?: {
      XFBML: {
        parse: (element?: HTMLElement) => void;
      };
    };
  }
}

function CardShell({
  children,
  colors,
  background = true,
}: {
  children: ReactNode;
  colors: StorefrontColorScheme;
  background?: boolean;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-xl border"
      style={{
        borderColor: colors.primary + "22",
        backgroundColor: background ? colors.background : "transparent",
      }}
    >
      {children}
    </div>
  );
}

export function InstagramScriptEmbed({
  permalink,
  colors,
  fallback,
}: {
  permalink: string;
  colors: StorefrontColorScheme;
  fallback: ReactNode;
}) {
  return (
    <ScriptEmbed
      cacheKey={permalink}
      scriptSrc="https://www.instagram.com/embed.js"
      process={() => {
        try {
          window.instgrm?.Embeds?.process();
        } catch {
          /* noop */
        }
      }}
      fallback={fallback}
    >
      <CardShell colors={colors}>
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={permalink}
          data-instgrm-version="14"
          data-instgrm-captioned=""
          style={{
            background: "#FFF",
            border: 0,
            margin: 0,
            maxWidth: "100%",
            minWidth: "100%",
            padding: 0,
            width: "100%",
          }}
        >
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", padding: "16px", color: "#3897f0" }}
          >
            View on Instagram
          </a>
        </blockquote>
      </CardShell>
    </ScriptEmbed>
  );
}

export function TwitterScriptEmbed({
  tweetUrl,
  colors,
  fallback,
}: {
  tweetUrl: string;
  colors: StorefrontColorScheme;
  fallback: ReactNode;
}) {
  return (
    <ScriptEmbed
      cacheKey={tweetUrl}
      scriptSrc="https://platform.twitter.com/widgets.js"
      process={(container) => {
        try {
          window.twttr?.widgets?.load(container);
        } catch {
          /* noop */
        }
      }}
      fallback={fallback}
    >
      <CardShell colors={colors}>
        <blockquote
          className="twitter-tweet"
          data-dnt="true"
          style={{ margin: 0 }}
        >
          <a href={tweetUrl} target="_blank" rel="noopener noreferrer">
            View post
          </a>
        </blockquote>
      </CardShell>
    </ScriptEmbed>
  );
}

export function TikTokScriptEmbed({
  videoUrl,
  videoId,
  colors,
  fallback,
}: {
  videoUrl: string;
  videoId: string;
  colors: StorefrontColorScheme;
  fallback: ReactNode;
}) {
  return (
    <ScriptEmbed
      cacheKey={videoId}
      scriptSrc="https://www.tiktok.com/embed.js"
      process={() => {
        // TikTok's embed.js scans for `.tiktok-embed` only on initial load.
        // For embeds added later (e.g. when script is already cached), force
        // a fresh scan by re-injecting the script tag.
        try {
          const src = "https://www.tiktok.com/embed.js";
          const existing = document.querySelector(`script[src="${src}"]`);
          if (existing) existing.remove();
          const s = document.createElement("script");
          s.src = src;
          s.async = true;
          s.dataset.loaded = "true";
          document.body.appendChild(s);
        } catch {
          /* noop */
        }
      }}
      fallback={fallback}
    >
      <CardShell colors={colors} background={false}>
        <blockquote
          className="tiktok-embed"
          cite={videoUrl}
          data-video-id={videoId}
          style={{ maxWidth: "100%", minWidth: "100%", margin: 0 }}
        >
          <section>
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", padding: "16px", color: "inherit" }}
            >
              Watch on TikTok
            </a>
          </section>
        </blockquote>
      </CardShell>
    </ScriptEmbed>
  );
}

function ensureFbRoot() {
  if (typeof document === "undefined") return;
  if (document.getElementById("fb-root")) return;
  const root = document.createElement("div");
  root.id = "fb-root";
  document.body.appendChild(root);
}

export function FacebookScriptEmbed({
  postUrl,
  colors,
  fallback,
}: {
  postUrl: string;
  colors: StorefrontColorScheme;
  fallback: ReactNode;
}) {
  ensureFbRoot();
  const isVideo =
    /\/videos\//.test(postUrl) ||
    /^https?:\/\/fb\.watch\//.test(postUrl) ||
    /^https?:\/\/(?:www\.)?facebook\.com\/watch/.test(postUrl);
  const className = isVideo ? "fb-video" : "fb-post";
  return (
    <ScriptEmbed
      cacheKey={postUrl}
      scriptSrc="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v18.0"
      process={(container) => {
        try {
          window.FB?.XFBML.parse(container);
        } catch {
          /* noop */
        }
      }}
      fallback={fallback}
    >
      <CardShell colors={colors}>
        <div
          className={className}
          data-href={postUrl}
          data-width="500"
          data-show-text="true"
        />
      </CardShell>
    </ScriptEmbed>
  );
}
