export function isAndroid() {
  if (typeof window === "undefined") return false; // For server-side rendering
  return /Android/i.test(window.navigator.userAgent);
}
