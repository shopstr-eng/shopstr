import { useEffect, useState } from "react";

type OGData = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
};

type Status = "loading" | "preview" | "link";

const LinkPreview = ({
  url,
  isUserMessage,
}: {
  url: string;
  isUserMessage: boolean;
}) => {
  const [ogData, setOgData] = useState<OGData | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    const fetchOG = async () => {
      try {
        const res = await fetch(
          `/api/og-preview?url=${encodeURIComponent(url)}`
        );
        if (!cancelled && res.ok) {
          const data: OGData = await res.json();
          if (data.title || data.image) {
            setOgData(data);
            setStatus("preview");
            return;
          }
        }
      } catch {}
      if (!cancelled) setStatus("link");
    };
    fetchOG();
    return () => {
      cancelled = true;
    };
  }, [url]);

  let hostname = url;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {}

  const linkClass = `underline ${
    isUserMessage
      ? "text-white/90 hover:text-white"
      : "text-shopstr-purple dark:text-shopstr-yellow"
  }`;

  if (status === "loading" || status === "link") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
  }

  return (
    <a
      href={ogData?.url || url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1 block overflow-hidden rounded-lg border no-underline transition-opacity hover:opacity-80 ${
        isUserMessage
          ? "border-white/30 bg-white/10"
          : "border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {ogData?.image && (
        <img
          src={ogData.image}
          alt={ogData.title || ""}
          className="h-36 w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="p-2">
        {ogData?.title && (
          <p
            className={`truncate text-sm font-semibold ${
              isUserMessage
                ? "text-white"
                : "text-light-text dark:text-dark-text"
            }`}
          >
            {ogData.title}
          </p>
        )}
        {ogData?.description && (
          <p
            className={`mt-0.5 line-clamp-2 text-xs ${
              isUserMessage
                ? "text-white/70"
                : "text-light-text/70 dark:text-dark-text/70"
            }`}
          >
            {ogData.description}
          </p>
        )}
        <p
          className={`mt-1 truncate text-xs ${
            isUserMessage
              ? "text-white/50"
              : "text-light-text/50 dark:text-dark-text/50"
          }`}
        >
          {hostname}
        </p>
      </div>
    </a>
  );
};

export default LinkPreview;
