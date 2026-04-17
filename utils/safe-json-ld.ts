/**
 * Serialize a value for embedding inside an inline <script> tag (e.g. JSON-LD).
 *
 * JSON.stringify does not escape characters that can break out of a <script>
 * context — most notably "</script>", plus the line/paragraph separators
 * U+2028/U+2029 which are valid in JSON but invalid in JS string literals.
 * If any of that data ever becomes user-influenced, an unescaped payload would
 * allow HTML/JS injection.  Always route JSON-LD through this helper.
 */
export function safeJsonLdString(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
