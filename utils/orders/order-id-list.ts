// Validation for endpoints that take a batch of order ids.

export const MAX_ORDER_IDS_PER_REQUEST = (() => {
  const configured = Number.parseInt(
    process.env.MAX_ORDER_IDS_PER_REQUEST || "",
    10
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 200;
})();
export const MAX_ORDER_ID_LENGTH = 128;

function normalizeOrderIds(orderIds: unknown): string[] | null {
  if (orderIds === null || orderIds === undefined) {
    return [];
  }

  if (typeof orderIds === "string") {
    const trimmed = orderIds.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(orderIds)) {
    return null;
  }

  const normalized: string[] = [];
  for (const value of orderIds) {
    if (typeof value !== "string") {
      return null;
    }
    // Normalize whitespace to avoid accidental client-side mismatches.
    const trimmed = value.trim();
    if (trimmed) {
      normalized.push(trimmed);
    }
  }

  return normalized;
}

export type OrderIdListResult =
  | { ok: true; orderIds: string[] }
  | { ok: false; status: 400 | 413; error: string };

// Accepts a string or an array of strings; returns unique, trimmed ids.
export function parseOrderIdList(orderIds: unknown): OrderIdListResult {
  const normalized = normalizeOrderIds(orderIds);
  if (normalized === null) {
    return {
      ok: false,
      status: 400,
      error: "Invalid orderIds. Expected a string or array of strings.",
    };
  }

  if (normalized.length > MAX_ORDER_IDS_PER_REQUEST) {
    return {
      ok: false,
      status: 413,
      error: `Too many order IDs. Maximum allowed is ${MAX_ORDER_IDS_PER_REQUEST}.`,
    };
  }

  if (normalized.some((id) => id.length > MAX_ORDER_ID_LENGTH)) {
    return {
      ok: false,
      status: 400,
      error: `Invalid order ID length. Maximum length is ${MAX_ORDER_ID_LENGTH}.`,
    };
  }

  return { ok: true, orderIds: Array.from(new Set(normalized)) };
}
