// Legacy ESLint plugins, glob 7 and test-exclude expect a callable export.
// All pattern parsing and matching is done by the patched upstream release.
const upstream = require("minimatch-patched");

function compatibleClass(Parent) {
  return class Minimatch extends Parent {
    constructor(...args) {
      super(...args);
      // glob 7 reads RegExp._glob and calls String.match(part). Upstream 11
      // uses non-recursive Matcher objects instead of regular expressions.
      // Preserve those objects (and their bounded matching engine) while
      // providing just the legacy metadata/protocol that glob needs.
      for (const row of this.set) {
        for (const part of row) {
          if (
            part &&
            typeof part === "object" &&
            typeof part.test === "function"
          ) {
            part._glob = part.pattern;
            part[Symbol.match] = (input) => (part.test(input) ? [input] : null);
          }
        }
      }
    }

    static defaults(defaults) {
      return class extends this {
        constructor(pattern, options) {
          super(pattern, { ...defaults, ...options });
        }
      };
    }
  };
}

function callable(api) {
  const match = (...args) =>
    (typeof api === "function" ? api : api.minimatch)(...args);
  Object.assign(match, api);
  match.Minimatch = compatibleClass(api.Minimatch);
  match.defaults = (options) => callable(api.defaults(options));
  return match;
}

module.exports = callable(upstream);
