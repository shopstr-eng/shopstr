// Derived from deepmerge 4.3.1 (MIT; see LICENSE).
// Unlike upstream, BOTH input objects are filtered, regardless of their
// prototypes or whether the dangerous key is already an own property.
const defaultIsMergeableObject = require("is-mergeable-object");
const blocked = new Set(["__proto__", "constructor", "prototype"]);
const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);
const enumerable = (object, key) =>
  Object.prototype.propertyIsEnumerable.call(object, key);

function emptyTarget(value) {
  return Array.isArray(value) ? [] : {};
}

function cloneUnlessOtherwiseSpecified(value, options) {
  return options.clone !== false && options.isMergeableObject(value)
    ? deepmerge(emptyTarget(value), value, options)
    : value;
}

function defaultArrayMerge(target, source, options) {
  return target
    .concat(source)
    .map((value) => cloneUnlessOtherwiseSpecified(value, options));
}

function getKeys(object) {
  return Object.keys(object)
    .concat(Object.getOwnPropertySymbols(object).filter((key) => enumerable(object, key)))
    .filter((key) => !blocked.has(key));
}

function propertyIsOnObject(object, key) {
  try {
    return key in object;
  } catch {
    return false;
  }
}

function write(object, key, value) {
  // Never invoke an inherited setter, even if Object.prototype was modified
  // by code outside this package.
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function mergeObject(target, source, options) {
  const destination = {};
  if (options.isMergeableObject(target)) {
    for (const key of getKeys(target)) {
      write(destination, key, cloneUnlessOtherwiseSpecified(target[key], options));
    }
  }
  for (const key of getKeys(source)) {
    if (
      propertyIsOnObject(target, key) &&
      !(hasOwn(target, key) && enumerable(target, key))
    ) {
      continue;
    }
    if (propertyIsOnObject(target, key) && options.isMergeableObject(source[key])) {
      const custom = options.customMerge && options.customMerge(key);
      const merge = typeof custom === "function" ? custom : deepmerge;
      write(destination, key, merge(target[key], source[key], options));
    } else {
      write(destination, key, cloneUnlessOtherwiseSpecified(source[key], options));
    }
  }
  return destination;
}

function deepmerge(target, source, options) {
  options = { ...options };
  options.arrayMerge = options.arrayMerge || defaultArrayMerge;
  options.isMergeableObject = options.isMergeableObject || defaultIsMergeableObject;
  options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified;
  const sourceIsArray = Array.isArray(source);
  if (sourceIsArray !== Array.isArray(target)) {
    return cloneUnlessOtherwiseSpecified(source, options);
  }
  return sourceIsArray
    ? options.arrayMerge(target, source, options)
    : mergeObject(target, source, options);
}

deepmerge.all = function (array, options) {
  if (!Array.isArray(array)) throw new Error("first argument should be an array");
  return array.reduce((previous, next) => deepmerge(previous, next, options), {});
};

module.exports = deepmerge;
