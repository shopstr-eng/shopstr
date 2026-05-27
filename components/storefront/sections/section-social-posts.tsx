import { ReactNode, useEffect, useRef, useState } from "react";
import { sanitizeUrl } from "@braintree/sanitize-url";
import {
  StorefrontColorScheme,
  StorefrontSection,
  StorefrontSocialPost,
} from "@/utils/types/types";
import FormattedText from "../formatted-text";
import { sanitizeStorefrontSocialLink } from "@/utils/storefront-links";
import {
  getSocialEmbed,
  parseFacebookUrl,
  parseInstagramUrl,
  parseTikTokUrl,
  parseTwitterUrl,
  SocialEmbedInfo,
} from "@/utils/social-embed";
import {
  FacebookScriptEmbed,
  InstagramScriptEmbed,
  TikTokScriptEmbed,
  TwitterScriptEmbed,
} from "./platform-script-embeds";

interface SectionSocialPostsProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

const SOCIAL_IMAGE_ICONS: Record<string, string> = {
  instagram: "/instagram-icon.png",
  x: "/x-logo-black.png",
  youtube: "/youtube-icon.png",
  tiktok: "/tiktok-icon.png",
  telegram: "/telegram-icon.png",
  facebook: "/facebook-icon.png",
};

const SOCIAL_EMOJI_ICONS: Record<string, string> = {
  website: "🌐",
  other: "🔗",
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  telegram: "Telegram",
  website: "Website",
  other: "Link",
};

function EmbedFrame({
  embed,
  title,
  colors,
}: {
  embed: SocialEmbedInfo;
  title: string;
  colors: StorefrontColorScheme;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border"
      style={{
        aspectRatio: embed.aspectRatio,
        borderColor: colors.primary + "22",
        backgroundColor: colors.background,
      }}
    >
      <iframe
        src={embed.src}
        title={title}
        loading="lazy"
        className="absolute inset-0 h-full w-full"
        allow={embed.allow}
        allowFullScreen={embed.allowFullScreen}
        scrolling={embed.scrolling}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

function FallbackCard({
  post,
  colors,
}: {
  post: StorefrontSocialPost;
  colors: StorefrontColorScheme;
}) {
  const href = sanitizeStorefrontSocialLink(post.url, "#");
  const iconSrc = SOCIAL_IMAGE_ICONS[post.platform];
  const emoji = SOCIAL_EMOJI_ICONS[post.platform];

  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border transition-transform hover:-translate-y-1"
      style={{
        borderColor: colors.primary + "22",
        backgroundColor: colors.background,
      }}
    >
      {post.image && (
        <div
          className="aspect-square w-full overflow-hidden"
          style={{ backgroundColor: colors.secondary + "11" }}
        >
          <img
            src={sanitizeUrl(post.image)}
            alt={post.caption || post.author || PLATFORM_LABEL[post.platform]}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
            style={{
              backgroundColor: colors.primary + "22",
              color: colors.primary,
            }}
          >
            {iconSrc ? (
              <img
                src={iconSrc}
                alt={PLATFORM_LABEL[post.platform]}
                className="h-4 w-4 object-contain"
              />
            ) : (
              emoji || SOCIAL_EMOJI_ICONS.other
            )}
          </span>
          <span
            className="font-heading text-xs font-bold tracking-wide uppercase opacity-70"
            style={{ color: colors.text }}
          >
            {post.author || PLATFORM_LABEL[post.platform]}
          </span>
        </div>
        {post.caption && (
          <FormattedText
            as="p"
            text={post.caption}
            className="font-body line-clamp-4 text-sm opacity-80"
          />
        )}
      </div>
    </a>
  );
}

function PostCard({
  post,
  colors,
}: {
  post: StorefrontSocialPost;
  colors: StorefrontColorScheme;
}) {
  const embed = getSocialEmbed(post.platform, post.url);
  const instagramRef =
    post.platform === "instagram" ? parseInstagramUrl(post.url) : null;
  const twitterRef = post.platform === "x" ? parseTwitterUrl(post.url) : null;
  const tiktokRef =
    post.platform === "tiktok" ? parseTikTokUrl(post.url) : null;
  const facebookRef =
    post.platform === "facebook" ? parseFacebookUrl(post.url) : null;

  const hasScriptEmbed = instagramRef || twitterRef || tiktokRef || facebookRef;

  if (!hasScriptEmbed && !embed) {
    return <FallbackCard post={post} colors={colors} />;
  }

  const title =
    post.caption ||
    post.author ||
    PLATFORM_LABEL[post.platform] ||
    "Social post";
  const hasCaption = Boolean(post.caption || post.author);

  const iframeFallback = embed ? (
    <EmbedFrame embed={embed} title={title} colors={colors} />
  ) : (
    <FallbackCard post={post} colors={colors} />
  );

  let primary: ReactNode;
  if (instagramRef) {
    primary = (
      <InstagramScriptEmbed
        permalink={instagramRef.permalink}
        colors={colors}
        fallback={iframeFallback}
      />
    );
  } else if (twitterRef) {
    primary = (
      <TwitterScriptEmbed
        tweetUrl={twitterRef.url}
        colors={colors}
        fallback={iframeFallback}
      />
    );
  } else if (tiktokRef) {
    primary = (
      <TikTokScriptEmbed
        videoUrl={tiktokRef.url}
        videoId={tiktokRef.id}
        colors={colors}
        fallback={iframeFallback}
      />
    );
  } else if (facebookRef) {
    primary = (
      <FacebookScriptEmbed
        postUrl={facebookRef.url}
        colors={colors}
        fallback={iframeFallback}
      />
    );
  } else {
    primary = iframeFallback;
  }

  return (
    <div className="storefront-social-card flex w-full flex-col gap-3">
      <div className="storefront-social-card-media relative min-h-0 w-full flex-1 overflow-hidden">
        {primary}
      </div>
      {hasCaption && (
        <div className="flex shrink-0 flex-col gap-1 px-1">
          {post.author && (
            <span
              className="font-heading text-xs font-bold tracking-wide uppercase opacity-70"
              style={{ color: colors.text }}
            >
              {post.author}
            </span>
          )}
          {post.caption && (
            <FormattedText
              as="p"
              text={post.caption}
              className="font-body line-clamp-2 text-sm opacity-80"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function SectionSocialPosts({
  section,
  colors,
}: SectionSocialPostsProps) {
  const posts = (section.socialPosts || []).filter((p) => p && p.url?.trim());
  const layout = section.socialPostsLayout || "grid";
  const autoplay = section.socialPostsAutoplay !== false;
  const speed = section.socialPostsSpeed ?? 40;

  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (layout !== "carousel" || !autoplay || posts.length === 0) return;
    const track = trackRef.current;
    if (!track) return;
    track.style.animationDuration = `${speed}s`;
  }, [layout, autoplay, speed, posts.length]);

  if (posts.length === 0) return null;

  return (
    <div
      className="box-border w-full min-w-0 overflow-hidden px-3 py-16 sm:px-4 md:px-6"
      style={{
        backgroundColor: colors.secondary + "08",
        maxWidth: "100vw",
      }}
    >
      <div className="mx-auto box-border w-full max-w-6xl min-w-0">
        {section.heading && (
          <FormattedText
            text={section.heading}
            as="h2"
            className="font-heading mb-3 text-center text-3xl font-bold"
            style={{ color: "var(--sf-text)" }}
          />
        )}
        {section.subheading && (
          <FormattedText
            text={section.subheading}
            as="p"
            className="font-body mb-10 text-center text-base opacity-70"
            style={{ color: "var(--sf-text)" }}
          />
        )}

        {layout === "grid" ? (
          <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, idx) => (
              <PostCard key={idx} post={post} colors={colors} />
            ))}
          </div>
        ) : (
          <div
            className={`storefront-social-carousel relative mx-auto w-full max-w-full ${
              autoplay ? "overflow-hidden" : "overflow-x-auto pb-2"
            }`}
            style={{ minWidth: 0 }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div
              ref={trackRef}
              className={`flex items-stretch gap-6 ${
                autoplay ? "storefront-social-carousel-track" : ""
              }`}
              style={{
                animationPlayState: paused ? "paused" : "running",
              }}
            >
              {(autoplay ? [...posts, ...posts] : posts).map((post, idx) => (
                <div
                  key={idx}
                  className="storefront-social-carousel-item flex-shrink-0"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <PostCard post={post} colors={colors} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes storefront-social-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .storefront-social-carousel-track {
          animation-name: storefront-social-scroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          width: max-content;
        }
        @media (prefers-reduced-motion: reduce) {
          .storefront-social-carousel-track {
            animation: none;
            overflow-x: auto;
          }
        }
        .storefront-social-carousel-item {
          width: 340px;
          max-width: calc(100vw - 2rem);
        }
        @media (max-width: 640px) {
          .storefront-social-carousel-item {
            width: min(320px, calc(100vw - 4rem));
          }
        }
        .storefront-social-card {
          height: 600px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }
        .storefront-social-card-media {
          contain: layout paint;
          border-radius: 12px;
          -webkit-mask-image: linear-gradient(
            to bottom,
            black 0%,
            black 85%,
            transparent 100%
          );
          mask-image: linear-gradient(
            to bottom,
            black 0%,
            black 85%,
            transparent 100%
          );
        }
        .storefront-social-card-media,
        .storefront-social-card-media > * {
          max-width: 100% !important;
          min-width: 0 !important;
        }
        .storefront-social-card-media iframe,
        .storefront-social-card-media .instagram-media,
        .storefront-social-card-media .twitter-tweet,
        .storefront-social-card-media .twitter-tweet-rendered,
        .storefront-social-card-media .fb-post,
        .storefront-social-card-media .fb-post > span,
        .storefront-social-card-media .fb-video,
        .storefront-social-card-media .fb-video > span,
        .storefront-social-card-media .tiktok-embed,
        .storefront-social-card-media .tiktok-embed iframe {
          max-width: 100% !important;
          min-width: 0 !important;
          width: 100% !important;
          box-sizing: border-box;
        }
        .storefront-social-card-media .instagram-media,
        .storefront-social-card-media .twitter-tweet {
          margin: 0 !important;
        }
      `}</style>
    </div>
  );
}
