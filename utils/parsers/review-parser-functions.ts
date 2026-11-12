/**
 * Parses one rating value from a review tag. Returns undefined when the value
 * is not a finite number. Valid values are clamped to the 0..1 range so a
 * single review cannot move a seller's average outside it.
 */
export const parseRatingValue = (
  raw: string | undefined
): number | undefined => {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
};

/**
 * Collects the valid ratings of a review by category. If a category appears
 * more than once the last valid value wins.
 */
export const getRatingsByCategory = (tags: string[][]): Map<string, number> => {
  const ratings = new Map<string, number>();
  for (const tag of tags) {
    if (tag[0] !== "rating" || !tag[2]) continue;
    const value = parseRatingValue(tag[1]);
    if (value !== undefined) ratings.set(tag[2], value);
  }
  return ratings;
};

export const getRatingValue = (tags: string[][], type: string): number =>
  getRatingsByCategory(tags).get(type) ?? 0;

/**
 * Returns a score between 0 and 1, or null when the review has no valid
 * rating. A thumb counts for half. The other categories share the other half.
 * Without other categories the thumb is the whole score.
 */
export const getReviewScore = (tags: string[][]): number | null => {
  const ratings = getRatingsByCategory(tags);
  if (ratings.size === 0) return null;

  const others = [...ratings.entries()].filter(([key]) => key !== "thumb");
  const thumb = ratings.get("thumb");

  if (thumb === undefined) {
    return others.reduce((sum, [, v]) => sum + v, 0) / others.length;
  }
  if (others.length === 0) return thumb;

  const otherAverage =
    others.reduce((sum, [, v]) => sum + v, 0) / others.length;
  return thumb * 0.5 + otherAverage * 0.5;
};

export const calculateWeightedScore = (tags: string[][]): number =>
  getReviewScore(tags) ?? 0;
