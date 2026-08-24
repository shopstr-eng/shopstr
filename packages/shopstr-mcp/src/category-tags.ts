export const CATEGORY_TAG_MAX_LENGTH = 100;
export const CATEGORY_TAGS_PER_EVENT_MAX = 20;
export const CATEGORY_SUMMARY_MAX_ENTRIES = 5_000;

const ASCII_CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;

export type AcceptedCategoryTag = {
  normalized: string;
  raw: string;
};

export function normalizeCategoryTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function acceptCategoryTag(
  raw: string
): AcceptedCategoryTag | undefined {
  if (
    raw.length === 0 ||
    raw.length > CATEGORY_TAG_MAX_LENGTH ||
    ASCII_CONTROL_CHARACTER_RE.test(raw)
  ) {
    return;
  }

  const normalized = normalizeCategoryTag(raw);
  if (normalized.length === 0 || normalized.length > CATEGORY_TAG_MAX_LENGTH) {
    return;
  }

  return { normalized, raw };
}

export function getAcceptedCategoryTags(
  tags: readonly string[][]
): AcceptedCategoryTag[] {
  const accepted: AcceptedCategoryTag[] = [];
  for (const tag of tags) {
    if (tag[0] !== "t" || typeof tag[1] !== "string") continue;
    const category = acceptCategoryTag(tag[1]);
    if (!category) continue;
    accepted.push(category);
    if (accepted.length >= CATEGORY_TAGS_PER_EVENT_MAX) break;
  }
  return accepted;
}
