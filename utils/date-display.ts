/**
 * Locale-safe formatting for timestamps rendered in the UI.
 *
 * `Date.prototype.toLocaleString()` gives no guarantee that a comma separates
 * the date and time portions of its output. Turkish (`tr-TR`), for example,
 * renders `08.09.2026 01:38:40`, so splitting that string on "," yields
 * `undefined` for the time part and throws as soon as it is dereferenced.
 * Format each part explicitly instead.
 */
export const formatTimestampParts = (
  timestamp: number,
  locales?: Intl.LocalesArgument
): [string, string] => {
  if (!timestamp) return ["", ""];

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return ["", ""];

  return [date.toLocaleDateString(locales), date.toLocaleTimeString(locales)];
};
