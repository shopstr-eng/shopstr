import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  ProMembershipProvider,
  useProMembership,
} from "../pro-membership-context";
import type { MembershipView } from "@/utils/pro/constants";
import { freeMembershipView } from "@/utils/pro/membership-status";
import {
  buildProCancelProof,
  buildProCreateSubscriptionProof,
  buildProHistoryProof,
  buildProManualInvoiceProof,
  buildProSyncProof,
  buildProVerifyInvoiceProof,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";

// Use a lightweight stand-in for the signer context so the real signer
// implementations (and their ESM-only deps) don't have to load. The provider
// and the test wrapper both import this same mocked SignerContext.
jest.mock("@/components/utility-components/nostr-context-provider", () => {
  const { createContext } = jest.requireActual("react");
  return { SignerContext: createContext({}) };
});

// Keep the proof-template builder + header constant real (postSigned/getSigned
// feed the template straight to signer.sign), but spy on the individual proof
// builders so each action can be asserted to sign the right proof.
jest.mock("@/utils/nostr/request-auth", () => {
  const actual = jest.requireActual("@/utils/nostr/request-auth");
  return {
    ...actual,
    buildProCreateSubscriptionProof: jest.fn(
      actual.buildProCreateSubscriptionProof
    ),
    buildProSyncProof: jest.fn(actual.buildProSyncProof),
    buildProCancelProof: jest.fn(actual.buildProCancelProof),
    buildProManualInvoiceProof: jest.fn(actual.buildProManualInvoiceProof),
    buildProHistoryProof: jest.fn(actual.buildProHistoryProof),
    buildProVerifyInvoiceProof: jest.fn(actual.buildProVerifyInvoiceProof),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  SignerContext,
} = require("@/components/utility-components/nostr-context-provider");

const PUBKEY = "pkA";

function makeView(overrides: Partial<MembershipView> = {}): MembershipView {
  return {
    pubkey: PUBKEY,
    status: "active",
    isPro: true,
    canEdit: true,
    isTrialing: false,
    isReadOnly: false,
    isHidden: false,
    isPubliclyVisible: true,
    billingMethod: "stripe",
    term: "monthly",
    trialEnd: null,
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    graceUntil: null,
    readonlyUntil: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

// A non-ok response whose body cannot be parsed (json() rejects). postSigned/
// getSigned swallow the parse error to {} and must fall back to the generic
// "Request to <path> failed" message.
function unparseableResponse() {
  return {
    ok: false,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let signer: { sign: jest.Mock };
let ctxValue: { pubkey?: string; signer?: unknown };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SignerContext.Provider value={ctxValue as any}>
      <ProMembershipProvider>{children}</ProMembershipProvider>
    </SignerContext.Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  signer = { sign: jest.fn().mockResolvedValue({ id: "signed-event" }) };
  ctxValue = { pubkey: undefined, signer: undefined };
});

afterEach(() => {
  // @ts-expect-error allow cleanup of the test fetch override
  delete global.fetch;
});

describe("ProMembershipProvider — refresh()", () => {
  it("ignores a stale status response after the pubkey changes mid-flight", async () => {
    const viewA = makeView({
      pubkey: "pkA",
      currentPeriodEnd: "2026-01-01T00:00:00.000Z",
    });
    const viewB = makeView({
      pubkey: "pkB",
      currentPeriodEnd: "2026-02-01T00:00:00.000Z",
    });
    const dA = deferred<Response>();
    const dB = deferred<Response>();

    global.fetch = jest.fn((url: unknown) => {
      const u = String(url);
      if (u.includes("pkA")) return dA.promise;
      if (u.includes("pkB")) return dB.promise;
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: "pkA", signer };
    const { result, rerender } = renderHook(() => useProMembership(), {
      wrapper,
    });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("pkA"))
    );

    // Pubkey changes before the first status request resolves.
    ctxValue = { pubkey: "pkB", signer };
    rerender();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("pkB"))
    );

    // Resolve the current (pkB) request first → membership reflects pkB.
    await act(async () => {
      dB.resolve(jsonResponse(viewB));
      await dB.promise;
    });
    await waitFor(() => expect(result.current.membership).toEqual(viewB));

    // The late, stale (pkA) response must be discarded, not clobber pkB.
    await act(async () => {
      dA.resolve(jsonResponse(viewA));
      await dA.promise;
    });
    expect(result.current.membership).toEqual(viewB);
  });

  it("falls back to the free view when the status request is non-ok", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "boom" }, false)
      ) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });

    await waitFor(() =>
      expect(result.current.membership).toEqual(freeMembershipView(PUBKEY))
    );
    expect(result.current.isPro).toBe(false);
  });

  it("falls back to the free view when the status fetch throws", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });

    await waitFor(() =>
      expect(result.current.membership).toEqual(freeMembershipView(PUBKEY))
    );
  });

  it("shows the logged-out free view without fetching when signed out", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    ctxValue = { pubkey: undefined, signer: undefined };
    const { result } = renderHook(() => useProMembership(), { wrapper });

    await waitFor(() =>
      expect(result.current.membership).toEqual(freeMembershipView(""))
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("ProMembershipProvider — signed actions", () => {
  it("cancel() signs the cancel proof and refreshes membership", async () => {
    const activeView = makeView();
    const canceledView = makeView({ cancelAtPeriodEnd: true });
    let statusBody: MembershipView = activeView;

    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/pro/status")) return jsonResponse(statusBody);
      if (u.includes("/api/pro/cancel")) {
        // The signed-event header proves pubkey ownership on the POST.
        expect(init?.method).toBe("POST");
        expect(
          (init?.headers as Record<string, string>)[SIGNED_EVENT_HEADER]
        ).toBeTruthy();
        return jsonResponse({ ok: true });
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() => expect(result.current.membership).toEqual(activeView));

    // The refresh inside cancel() should pick up the canceled status.
    statusBody = canceledView;
    await act(async () => {
      await result.current.cancel();
    });

    expect(buildProCancelProof).toHaveBeenCalledWith(PUBKEY);
    expect(signer.sign).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(result.current.membership).toEqual(canceledView)
    );
  });

  it("startStripeSubscription() signs the create-subscription proof and returns the client secret", async () => {
    const activeView = makeView();
    const subscription = {
      subscriptionId: "sub_123",
      clientSecret: "pi_123_secret_456",
    };

    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/pro/status")) return jsonResponse(activeView);
      if (u.includes("/api/pro/create-subscription")) {
        expect(init?.method).toBe("POST");
        expect(
          (init?.headers as Record<string, string>)[SIGNED_EVENT_HEADER]
        ).toBeTruthy();
        // The POST body carries the pubkey + term the server needs.
        expect(JSON.parse(String(init?.body))).toEqual({
          pubkey: PUBKEY,
          term: "monthly",
        });
        return jsonResponse(subscription);
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() => expect(result.current.membership).toEqual(activeView));

    let returned:
      | { subscriptionId: string; clientSecret: string | null }
      | undefined;
    await act(async () => {
      returned = await result.current.startStripeSubscription("monthly");
    });

    expect(buildProCreateSubscriptionProof).toHaveBeenCalledWith({
      pubkey: PUBKEY,
      term: "monthly",
    });
    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(returned).toEqual(subscription);
    // Starting a subscription does not mutate the stored membership view.
    expect(result.current.membership).toEqual(activeView);
  });

  it("createManualInvoice() signs the manual-invoice proof and returns the invoice payload", async () => {
    const activeView = makeView({ billingMethod: "manual" });
    const invoice = {
      invoiceId: "inv_1",
      paymentRequest: "lnbc1...",
      amountSats: 2100,
      expiresAt: "2026-06-01T00:00:00.000Z",
    };

    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/pro/status")) return jsonResponse(activeView);
      if (u.includes("/api/pro/manual-invoice")) {
        expect(init?.method).toBe("POST");
        expect(
          (init?.headers as Record<string, string>)[SIGNED_EVENT_HEADER]
        ).toBeTruthy();
        expect(JSON.parse(String(init?.body))).toEqual({
          pubkey: PUBKEY,
          term: "yearly",
          method: "bitcoin",
        });
        return jsonResponse(invoice);
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() => expect(result.current.membership).toEqual(activeView));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.createManualInvoice("yearly", "bitcoin");
    });

    expect(buildProManualInvoiceProof).toHaveBeenCalledWith({
      pubkey: PUBKEY,
      term: "yearly",
      method: "bitcoin",
    });
    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(returned).toEqual(invoice);
    // Creating an invoice does not advance membership before it is paid.
    expect(result.current.membership).toEqual(activeView);
  });

  it("fetchHistory() signs the history proof on a GET and returns the history array", async () => {
    const activeView = makeView();
    const history = [
      { id: "ch_2", amount: 2100, createdAt: "2026-05-01T00:00:00.000Z" },
      { id: "ch_1", amount: 2100, createdAt: "2026-04-01T00:00:00.000Z" },
    ];

    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/pro/status")) return jsonResponse(activeView);
      if (u.includes("/api/pro/history")) {
        // History reads are signed GETs (no body), with the pubkey on the query.
        expect(init?.method).toBe("GET");
        expect(u).toContain(`pubkey=${PUBKEY}`);
        expect(
          (init?.headers as Record<string, string>)[SIGNED_EVENT_HEADER]
        ).toBeTruthy();
        return jsonResponse({ history });
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() => expect(result.current.membership).toEqual(activeView));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.fetchHistory();
    });

    expect(buildProHistoryProof).toHaveBeenCalledWith(PUBKEY);
    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(returned).toEqual(history);
  });

  it("fetchHistory() defaults to an empty array when the response omits history", async () => {
    const activeView = makeView();

    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("/api/pro/status")) return jsonResponse(activeView);
      if (u.includes("/api/pro/history")) return jsonResponse({});
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() => expect(result.current.membership).toEqual(activeView));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.fetchHistory();
    });

    expect(returned).toEqual([]);
  });

  it("syncStripe() signs the sync proof and stores the returned view", async () => {
    const activeView = makeView();
    const syncedView = makeView({ term: "yearly" });

    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/pro/status")) return jsonResponse(activeView);
      if (u.includes("/api/pro/sync")) {
        expect(init?.method).toBe("POST");
        expect(
          (init?.headers as Record<string, string>)[SIGNED_EVENT_HEADER]
        ).toBeTruthy();
        return jsonResponse(syncedView);
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() => expect(result.current.membership).toEqual(activeView));

    let returned: MembershipView | undefined;
    await act(async () => {
      returned = await result.current.syncStripe();
    });

    expect(buildProSyncProof).toHaveBeenCalledWith(PUBKEY);
    expect(returned).toEqual(syncedView);
    expect(result.current.membership).toEqual(syncedView);
  });

  it("verifyManualInvoice() updates membership only when the invoice is paid", async () => {
    const activeView = makeView({ billingMethod: "manual" });
    const paidView = makeView({
      billingMethod: "manual",
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
    });
    let verifyBody: unknown = { paid: false };

    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/pro/status")) return jsonResponse(activeView);
      if (u.includes("/api/pro/verify-invoice")) {
        expect(init?.method).toBe("POST");
        expect(
          (init?.headers as Record<string, string>)[SIGNED_EVENT_HEADER]
        ).toBeTruthy();
        return jsonResponse(verifyBody);
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;

    ctxValue = { pubkey: PUBKEY, signer };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() => expect(result.current.membership).toEqual(activeView));

    // An unpaid poll must not change the stored membership.
    await act(async () => {
      await result.current.verifyManualInvoice("inv_1");
    });
    expect(buildProVerifyInvoiceProof).toHaveBeenCalledWith({
      pubkey: PUBKEY,
      invoiceId: "inv_1",
    });
    expect(result.current.membership).toEqual(activeView);

    // Once paid with a view payload, membership advances to the new view.
    verifyBody = { paid: true, view: paidView };
    await act(async () => {
      await result.current.verifyManualInvoice("inv_1");
    });
    expect(result.current.membership).toEqual(paidView);
  });
});

describe("ProMembershipProvider — signed action failures", () => {
  type Action = ReturnType<typeof useProMembership>;

  // Each signed action, the endpoint it hits, and the path baked into the
  // generic fallback message (fetchHistory carries the pubkey on the query).
  const cases: Array<{
    name: string;
    path: string;
    errorPath: string;
    invoke: (a: Action) => Promise<unknown>;
  }> = [
    {
      name: "startStripeSubscription",
      path: "/api/pro/create-subscription",
      errorPath: "/api/pro/create-subscription",
      invoke: (a) => a.startStripeSubscription("monthly"),
    },
    {
      name: "syncStripe",
      path: "/api/pro/sync",
      errorPath: "/api/pro/sync",
      invoke: (a) => a.syncStripe(),
    },
    {
      name: "cancel",
      path: "/api/pro/cancel",
      errorPath: "/api/pro/cancel",
      invoke: (a) => a.cancel(),
    },
    {
      name: "createManualInvoice",
      path: "/api/pro/manual-invoice",
      errorPath: "/api/pro/manual-invoice",
      invoke: (a) => a.createManualInvoice("yearly", "bitcoin"),
    },
    {
      name: "verifyManualInvoice",
      path: "/api/pro/verify-invoice",
      errorPath: "/api/pro/verify-invoice",
      invoke: (a) => a.verifyManualInvoice("inv_1"),
    },
    {
      name: "fetchHistory",
      path: "/api/pro/history",
      errorPath: `/api/pro/history?pubkey=${PUBKEY}`,
      invoke: (a) => a.fetchHistory(),
    },
  ];

  it.each(cases)(
    "$name rejects with the server-provided error message and leaves membership unchanged",
    async ({ path, invoke }) => {
      const activeView = makeView();

      global.fetch = jest.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/api/pro/status")) return jsonResponse(activeView);
        if (u.includes(path)) {
          return jsonResponse({ error: "Card was declined" }, false);
        }
        return Promise.reject(new Error(`unexpected ${u}`));
      }) as unknown as typeof fetch;

      ctxValue = { pubkey: PUBKEY, signer };
      const { result } = renderHook(() => useProMembership(), { wrapper });
      await waitFor(() =>
        expect(result.current.membership).toEqual(activeView)
      );

      await act(async () => {
        await expect(invoke(result.current)).rejects.toThrow(
          "Card was declined"
        );
      });

      // A failed action must not mutate the stored membership view.
      expect(result.current.membership).toEqual(activeView);
    }
  );

  it.each(cases)(
    "$name falls back to the generic error when the body is empty/unparseable",
    async ({ path, errorPath, invoke }) => {
      const activeView = makeView();

      global.fetch = jest.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/api/pro/status")) return jsonResponse(activeView);
        if (u.includes(path)) return unparseableResponse();
        return Promise.reject(new Error(`unexpected ${u}`));
      }) as unknown as typeof fetch;

      ctxValue = { pubkey: PUBKEY, signer };
      const { result } = renderHook(() => useProMembership(), { wrapper });
      await waitFor(() =>
        expect(result.current.membership).toEqual(activeView)
      );

      await act(async () => {
        await expect(invoke(result.current)).rejects.toThrow(
          `Request to ${errorPath} failed`
        );
      });

      expect(result.current.membership).toEqual(activeView);
    }
  );
});

describe("ProMembershipProvider — requireAuth", () => {
  it("rejects signed actions when signed out", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    ctxValue = { pubkey: undefined, signer: undefined };
    const { result } = renderHook(() => useProMembership(), { wrapper });
    await waitFor(() =>
      expect(result.current.membership).toEqual(freeMembershipView(""))
    );

    const expected = "You must be signed in to manage your Pro membership.";
    await expect(result.current.cancel()).rejects.toThrow(expected);
    await expect(result.current.syncStripe()).rejects.toThrow(expected);
    await expect(result.current.verifyManualInvoice("inv_1")).rejects.toThrow(
      expected
    );
    await expect(
      result.current.startStripeSubscription("monthly")
    ).rejects.toThrow(expected);
    await expect(result.current.fetchHistory()).rejects.toThrow(expected);

    // No signing or network traffic happens for an unauthenticated caller.
    expect(signer.sign).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
