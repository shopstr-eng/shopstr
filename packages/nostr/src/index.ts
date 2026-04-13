import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  SimplePool,
  type Event,
  type EventTemplate,
} from "nostr-tools";

import {
  DEFAULT_SELLER_RELAYS,
  type NostrEventRecord,
  type SellerSession,
} from "@milk-market/domain";

export const NOSTR_PACKAGE_READY = true as const;

const STRIPE_CONNECT_AUTH_KIND = 27235;
const shopPublishPool = new SimplePool();

export type SellerActionAuthTag =
  | "stripe-connect"
  | "notification-email-read"
  | "notification-email-write"
  | "storefront-slug-write";

type EventTemplateWithPubkey = EventTemplate & {
  pubkey: string;
};

export class SellerNostrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerNostrError";
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function getPrivKeyBytes(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec.trim());
  if (decoded.type !== "nsec") {
    throw new SellerNostrError("Invalid nsec input.");
  }

  return decoded.data as Uint8Array;
}

function getPublishRelays(session: SellerSession): string[] {
  const relayList =
    session.writeRelays.length > 0 ? session.writeRelays : session.relays;
  const fallbackRelays =
    relayList.length > 0 ? relayList : [...DEFAULT_SELLER_RELAYS];

  return Array.from(new Set(fallbackRelays));
}

export function generateSellerNsecCredentials(): {
  nsec: string;
  pubkey: string;
} {
  const secretKey = generateSecretKey();
  return {
    nsec: nip19.nsecEncode(secretKey),
    pubkey: getPublicKey(secretKey),
  };
}

export function validateSellerNsec(input: string): {
  valid: boolean;
  normalized?: string;
  pubkey?: string;
  error?: string;
} {
  const normalized = input.trim();

  if (!normalized) {
    return { valid: false, error: "Enter your nsec to continue." };
  }

  try {
    const privateKey = getPrivKeyBytes(normalized);
    return {
      valid: true,
      normalized,
      pubkey: getPublicKey(privateKey),
    };
  } catch {
    return { valid: false, error: "Enter a valid nsec key." };
  }
}

export function createSellerSessionFromNsec(
  nsec: string,
  options: {
    authMethod?: SellerSession["authMethod"];
    email?: string;
    relays?: string[];
    writeRelays?: string[];
  } = {}
): SellerSession {
  const validation = validateSellerNsec(nsec);
  if (!validation.valid || !validation.normalized || !validation.pubkey) {
    throw new SellerNostrError(validation.error ?? "Invalid nsec.");
  }

  const relays =
    options.relays && options.relays.length > 0
      ? options.relays
      : [...DEFAULT_SELLER_RELAYS];
  const writeRelays =
    options.writeRelays && options.writeRelays.length > 0
      ? options.writeRelays
      : relays;

  return {
    authMethod: options.authMethod ?? "nsec",
    pubkey: validation.pubkey,
    nsec: validation.normalized,
    email: options.email,
    relays,
    writeRelays,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export function serializeSellerSession(session: SellerSession): string {
  return JSON.stringify({
    version: 1,
    ...session,
  });
}

export function deserializeSellerSession(raw: string): SellerSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SellerSession> & {
      version?: number;
    };
    if (
      !parsed ||
      typeof parsed.pubkey !== "string" ||
      typeof parsed.nsec !== "string" ||
      (parsed.authMethod !== "email" && parsed.authMethod !== "nsec")
    ) {
      return null;
    }

    return {
      authMethod: parsed.authMethod,
      pubkey: parsed.pubkey,
      nsec: parsed.nsec,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      relays:
        Array.isArray(parsed.relays) &&
        parsed.relays.every((item) => typeof item === "string")
          ? parsed.relays
          : [...DEFAULT_SELLER_RELAYS],
      writeRelays:
        Array.isArray(parsed.writeRelays) &&
        parsed.writeRelays.every((item) => typeof item === "string")
          ? parsed.writeRelays
          : [...DEFAULT_SELLER_RELAYS],
      createdAt:
        typeof parsed.createdAt === "number"
          ? parsed.createdAt
          : Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

export function signEventTemplate(
  session: SellerSession,
  eventTemplate: EventTemplate
): Event {
  return finalizeEvent(eventTemplate, getPrivKeyBytes(session.nsec));
}

function getSellerActionAuthContent(action: SellerActionAuthTag): string {
  switch (action) {
    case "notification-email-read":
      return "Authorize notification email access";
    case "notification-email-write":
      return "Authorize notification email updates";
    case "storefront-slug-write":
      return "Authorize storefront slug updates";
    case "stripe-connect":
    default:
      return "Authorize Stripe Connect account management";
  }
}

export function createSellerActionAuthEventTemplate(
  pubkey: string,
  action: SellerActionAuthTag
): EventTemplateWithPubkey {
  return {
    pubkey,
    kind: STRIPE_CONNECT_AUTH_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["action", action]],
    content: getSellerActionAuthContent(action),
  };
}

export function createStripeConnectAuthEventTemplate(
  pubkey: string
): EventTemplateWithPubkey {
  return createSellerActionAuthEventTemplate(pubkey, "stripe-connect");
}

export function createSignedSellerActionAuthEvent(
  session: SellerSession,
  action: SellerActionAuthTag
): Event {
  return signEventTemplate(
    session,
    createSellerActionAuthEventTemplate(session.pubkey, action)
  );
}

export function createSignedStripeConnectAuthEvent(
  session: SellerSession
): Event {
  return createSignedSellerActionAuthEvent(session, "stripe-connect");
}

export function createSellerShopProfileEventTemplate(
  session: SellerSession,
  content: string
): EventTemplateWithPubkey {
  return {
    pubkey: session.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content,
    kind: 30019,
    tags: [["d", session.pubkey]],
  };
}

export async function cacheSignedEvent(
  baseUrl: string,
  event: NostrEventRecord
): Promise<void> {
  const response = await fetch(joinUrl(baseUrl, "/api/db/cache-event"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new SellerNostrError("Failed to cache the signed event.");
  }
}

export async function publishSignedEvent(
  session: SellerSession,
  event: Event
): Promise<void> {
  const relays = getPublishRelays(session);
  await Promise.allSettled(shopPublishPool.publish(relays, event));
}

export async function publishSellerShopProfile(params: {
  baseUrl: string;
  session: SellerSession;
  content: string;
}): Promise<Event> {
  const signedEvent = signEventTemplate(
    params.session,
    createSellerShopProfileEventTemplate(params.session, params.content)
  );

  await cacheSignedEvent(params.baseUrl, signedEvent);
  await publishSignedEvent(params.session, signedEvent);

  return signedEvent;
}
