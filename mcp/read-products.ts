import { SimplePool, type Event, type Filter } from "nostr-tools";

type ProductData = {
  id: string;
  pubkey: string;
  createdAt: number;
  title: string;
  summary: string;
  publishedAt: string;
  images: string[];
  categories: string[];
  location: string;
  price: number;
  currency: string;
  totalCost: number;
  d?: string;
  contentWarning?: boolean;
  quantity?: number;
  condition?: string;
  status?: string;
  required?: string;
  restrictions?: string;
  expiration?: number;
};

type CliOptions = {
  relays: string[];
  pubkey?: string;
  id?: string;
  limit?: number;
  includeZapsnag?: boolean;
};

type ValidatedCliOptions = {
  relays: string[];
  pubkey?: string;
  id?: string;
  limit: number;
  includeZapsnag: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    relays: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--relay" && next) {
      options.relays.push(next);
      i += 1;
      continue;
    }

    if (arg === "--pubkey" && next) {
      options.pubkey = next;
      i += 1;
      continue;
    }

    if (arg === "--id" && next) {
      options.id = next;
      i += 1;
      continue;
    }

    if (arg === "--limit" && next) {
      const limit = Number(next);
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
      i += 1;
      continue;
    }

    if (arg === "--include-zapsnag") {
      options.includeZapsnag = true;
    }
  }

  if (options.relays.length === 0) {
    options.relays = [
      "wss://relay.damus.io",
      "wss://relay.primal.net",
      "wss://nos.lol",
    ];
  }

  return options;
}

function validateOptions(options: CliOptions): ValidatedCliOptions {
  return {
    relays: options.relays.filter(Boolean),
    pubkey: options.pubkey?.trim() || undefined,
    id: options.id?.trim() || undefined,
    limit:
      typeof options.limit === "number" && options.limit > 0 ? options.limit : 10,
    includeZapsnag: options.includeZapsnag ?? false,
  };
}

function getTagValue(tags: string[][], key: string): string | undefined {
  return tags.find((tag) => tag[0] === key)?.[1];
}

function getTagValues(tags: string[][], key: string): string[] {
  return tags
    .filter((tag) => tag[0] === key)
    .map((tag) => tag[1] || "")
    .filter(Boolean);
}

function parseProductEvent(event: Event): ProductData | undefined {
  if (event.kind !== 30402) return undefined;

  const tags = event.tags as string[][];
  const priceTag = tags.find((tag) => tag[0] === "price");
  const price = priceTag?.[1] ? Number(priceTag[1]) : 0;

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    title: getTagValue(tags, "title") || "",
    summary: getTagValue(tags, "summary") || "",
    publishedAt: getTagValue(tags, "published_at") || "",
    images: getTagValues(tags, "image"),
    categories: getTagValues(tags, "t"),
    location: getTagValue(tags, "location") || "",
    price,
    currency: priceTag?.[2] || "",
    totalCost: price,
    d: getTagValue(tags, "d"),
    contentWarning:
      tags.some((tag) => tag[0] === "content-warning") ||
      tags.some((tag) => tag[0] === "L" && tag[1] === "content-warning") ||
      tags.some((tag) => tag[0] === "l" && tag[2] === "content-warning"),
    quantity: getTagValue(tags, "quantity")
      ? Number(getTagValue(tags, "quantity"))
      : undefined,
    condition: getTagValue(tags, "condition"),
    status: getTagValue(tags, "status"),
    required: getTagValue(tags, "required"),
    restrictions: getTagValue(tags, "restrictions"),
    expiration: getTagValue(tags, "valid_until")
      ? Number(getTagValue(tags, "valid_until"))
      : undefined,
  };
}

function parseZapsnagEvent(event: Event): ProductData | undefined {
  if (event.kind !== 1) return undefined;

  const tags = event.tags as string[][];
  const hasZapsnagTag = tags.some(
    (tag) =>
      tag[0] === "t" && (tag[1] === "shopstr-zapsnag" || tag[1] === "zapsnag")
  );

  if (!hasZapsnagTag) return undefined;

  const priceRegex =
    /(?:price|cost|⚡)\s*[:=-]?\s*(\d+[\d,]*)\s*(sats?|satoshis?|usd|eur)?/i;
  const imageRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i;

  const priceMatch = event.content.match(priceRegex);
  const imageMatch = event.content.match(imageRegex);

  let price = 0;
  let currency = "sats";

  if (priceMatch?.[1]) {
    price = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    const rawCurrency = priceMatch[2]?.toLowerCase();
    if (rawCurrency?.includes("usd")) currency = "USD";
    if (rawCurrency?.includes("eur")) currency = "EUR";
  }

  const image = imageMatch?.[0] || `https://robohash.org/${event.id}`;
  const cleanedContent = event.content
    .replace(priceRegex, "")
    .replace(/#zapsnag/gi, "")
    .replace(imageRegex, "")
    .trim();

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    title:
      cleanedContent.length > 0
        ? cleanedContent.length > 50
          ? `${cleanedContent.substring(0, 50)}...`
          : cleanedContent
        : "Flash Sale Item",
    summary: event.content,
    publishedAt: String(event.created_at),
    images: [image],
    categories: ["zapsnag"],
    location: "Global",
    price,
    currency,
    totalCost: price,
    d: "zapsnag",
    status: "active",
  };
}

function getEventKey(event: Event): string {
  const dTag = (event.tags as string[][]).find((tag) => tag[0] === "d")?.[1];
  return dTag ? `${event.pubkey}:${dTag}` : event.id;
}

async function queryEvents(relays: string[], filters: Filter[]): Promise<Event[]> {
  const pool = new SimplePool();

  try {
    const eventMap = new Map<string, Event>();

    for (const filter of filters) {
      console.log("Using relay filter:", JSON.stringify(filter, null, 2));
      const events = await pool.querySync(relays, filter);

      for (const event of events) {
        eventMap.set(event.id, event);
      }
    }

    return Array.from(eventMap.values());
  } finally {
    try {
      pool.close(relays);
    } catch {
      // ignore relay close errors in this read-only script
    }
  }
}

async function fetchProducts(options: ValidatedCliOptions): Promise<ProductData[]> {
  const filters: Filter[] = [
    {
      kinds: [30402],
      authors: options.pubkey ? [options.pubkey] : undefined,
      ids: options.id ? [options.id] : undefined,
      limit: options.limit,
    },
  ];

  if (options.includeZapsnag) {
    filters.push({
      kinds: [1],
      "#t": ["shopstr-zapsnag", "zapsnag"],
      authors: options.pubkey ? [options.pubkey] : undefined,
      ids: options.id ? [options.id] : undefined,
      limit: options.limit,
    });
  }

  const events = await queryEvents(options.relays, filters);
  const latestEvents = new Map<string, Event>();

  for (const event of events) {
    const key = getEventKey(event);
    const existing = latestEvents.get(key);

    if (!existing || event.created_at >= existing.created_at) {
      latestEvents.set(key, event);
    }
  }

  return Array.from(latestEvents.values())
    .map((event) =>
      event.kind === 30402 ? parseProductEvent(event) : parseZapsnagEvent(event)
    )
    .filter((product): product is ProductData => !!product);
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  process.exitCode = 1;
});

async function main() {
  const options = validateOptions(parseArgs(process.argv.slice(2)));
  const products = await fetchProducts(options);
  console.log(JSON.stringify(products, null, 2));
}

main().catch((error) => {
  console.error("Failed to read marketplace products:", error);
  process.exitCode = 1;
});
