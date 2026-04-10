import type { NostrEventRecord, StripeConnectStatus } from "@milk-market/domain";

export const API_CLIENT_PACKAGE_READY = true as const;

export class MilkMarketApiError extends Error {
  public readonly status: number;
  public readonly payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "MilkMarketApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface CreateMilkMarketApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface EmailAuthInput {
  email: string;
  password: string;
}

export interface EmailAuthResponse {
  success: boolean;
  nsec: string;
  pubkey: string;
}

export interface NotificationEmailPayload {
  email: string;
  role: "seller";
  pubkey: string;
}

export interface RegisterStorefrontSlugPayload {
  pubkey: string;
  slug: string;
}

export interface DeleteStorefrontSlugPayload {
  pubkey: string;
}

export interface RegisterStorefrontSlugResponse {
  slug: string;
}

export interface StripeAuthPayload {
  pubkey: string;
  signedEvent: unknown;
}

export interface CreateStripeConnectAccountResponse {
  accountId: string;
  alreadyExists: boolean;
}

export interface CreateStripeConnectLinkPayload extends StripeAuthPayload {
  accountId: string;
  returnPath?: string;
  refreshPath?: string;
  returnUrl?: string;
  refreshUrl?: string;
}

export interface CreateStripeConnectLinkResponse {
  url: string;
}

export interface SaveNotificationEmailResponse {
  success: boolean;
}

export interface FetchNotificationEmailResponse {
  email?: string | null;
}

type RequestInitWithJson = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path;
  }

  return `${trimTrailingSlash(baseUrl)}${path}`;
}

export function createMilkMarketApiClient(
  options: CreateMilkMarketApiClientOptions = {}
) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  async function requestJson<T>(
    path: string,
    init: RequestInitWithJson = {}
  ): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    let body: BodyInit | undefined;

    if (typeof init.body !== "undefined") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }

    const response = await fetchImpl(joinUrl(baseUrl, path), {
      ...init,
      headers,
      body,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? ((payload as { error: string }).error as string)
          : `Request failed with status ${response.status}`;
      throw new MilkMarketApiError(message, response.status, payload);
    }

    return payload as T;
  }

  return {
    emailSignIn(input: EmailAuthInput) {
      return requestJson<EmailAuthResponse>("/api/auth/email-signin", {
        method: "POST",
        body: input,
      });
    },
    emailSignUp(input: EmailAuthInput) {
      return requestJson<EmailAuthResponse>("/api/auth/email-signup", {
        method: "POST",
        body: input,
      });
    },
    fetchProfiles() {
      return requestJson<NostrEventRecord[]>("/api/db/fetch-profiles");
    },
    fetchProducts() {
      return requestJson<NostrEventRecord[]>("/api/db/fetch-products");
    },
    fetchSellerNotificationEmail(pubkey: string, signedEvent: unknown) {
      return requestJson<FetchNotificationEmailResponse>(
        "/api/email/notification-email/read",
        {
          method: "POST",
          body: {
            pubkey,
            role: "seller",
            signedEvent,
          },
        }
      );
    },
    saveSellerNotificationEmail(
      payload: NotificationEmailPayload,
      signedEvent: unknown
    ) {
      return requestJson<SaveNotificationEmailResponse>(
        "/api/email/notification-email",
        {
          method: "POST",
          body: {
            ...payload,
            signedEvent,
          },
        }
      );
    },
    registerStorefrontSlug(
      payload: RegisterStorefrontSlugPayload,
      signedEvent: unknown
    ) {
      return requestJson<RegisterStorefrontSlugResponse>(
        "/api/storefront/register-slug",
        {
          method: "POST",
          body: {
            ...payload,
            signedEvent,
          },
        }
      );
    },
    deleteStorefrontSlug(
      payload: DeleteStorefrontSlugPayload,
      signedEvent: unknown
    ) {
      return requestJson<{ success: boolean }>("/api/storefront/register-slug", {
        method: "DELETE",
        body: {
          ...payload,
          signedEvent,
        },
      });
    },
    getStripeConnectStatus(payload: StripeAuthPayload) {
      return requestJson<StripeConnectStatus>(
        "/api/stripe/connect/account-status",
        {
          method: "POST",
          body: payload,
        }
      );
    },
    createStripeConnectAccount(payload: StripeAuthPayload) {
      return requestJson<CreateStripeConnectAccountResponse>(
        "/api/stripe/connect/create-account",
        {
          method: "POST",
          body: payload,
        }
      );
    },
    createStripeConnectAccountLink(payload: CreateStripeConnectLinkPayload) {
      return requestJson<CreateStripeConnectLinkResponse>(
        "/api/stripe/connect/create-account-link",
        {
          method: "POST",
          body: payload,
        }
      );
    },
  };
}

export type MilkMarketApiClient = ReturnType<typeof createMilkMarketApiClient>;
