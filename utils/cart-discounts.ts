export type CartDiscountsMap = Record<string, { code: string }>;

export const isCartDiscountsMap = (
  value: unknown
): value is CartDiscountsMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }

    const candidate = entry as { code?: unknown };
    return typeof candidate.code === "string";
  });
};
