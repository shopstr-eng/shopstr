const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { promisify } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");
const merge = require("deepmerge");
const match = require("minimatch");

test("patched minimatch supports callable, named and defaults APIs", () => {
  assert.equal(match("src/a.ts", "**/*.ts"), true);
  assert.equal(match.minimatch("src/a.js", "**/*.ts"), false);
  assert.equal(new match.Minimatch("**/*.ts").match("src/a.ts"), true);
  assert.deepEqual(match.match(["a.ts", "b.js"], "*.ts"), ["a.ts"]);
  assert.deepEqual(match.braceExpand("{a,b}.ts"), ["a.ts", "b.ts"]);
  assert.equal(match.defaults({ dot: true })(".hidden", "*"), true);
  assert.equal(
    match.defaults({ dot: true }).defaults({ nocase: true })(".A", ".a"),
    true
  );
  const Defaults = match
    .defaults({ dot: true })
    .Minimatch.defaults({ nocase: true });
  assert.equal(new Defaults(".a").match(".A"), true);
});

test("legacy glob and coverage consumers actually use the compatibility API", async () => {
  const files = await promisify(require("glob"))("packages/*/package.json");
  assert.ok(files.includes("packages/minimatch-compat/package.json"));
  assert.ok(
    require("glob").sync(
      "packages/{minimatch-compat,deepmerge-safe}/package.json"
    ).length === 2
  );
  const TestExclude = require("test-exclude");
  const exclude = new TestExclude({ cwd: process.cwd() });
  assert.equal(
    exclude.shouldInstrument(path.resolve("utils/url-slugs.ts")),
    true
  );
  assert.equal(
    exclude.shouldInstrument(path.resolve("node_modules/example.js")),
    false
  );
  const { FileList } = require("filelist");
  assert.ok(
    new FileList("packages/*/package.json")
      .toArray()
      .includes("packages/minimatch-compat/package.json")
  );
  for (const consumer of [
    "eslint-plugin-import",
    "eslint-plugin-react",
    "readdir-glob",
  ]) {
    const fromConsumer = createRequire(require.resolve(consumer));
    assert.equal(fromConsumer("minimatch")("a.ts", "*.ts"), true);
  }
});

test("modern glob consumers retain async and sync APIs", async () => {
  const fromJest = createRequire(require.resolve("jest-config"));
  const glob = fromJest("glob");
  assert.deepEqual(await glob.glob("packages/deepmerge-safe/package.json"), [
    "packages/deepmerge-safe/package.json",
  ]);
  assert.deepEqual(glob.globSync("packages/deepmerge-safe/package.json"), [
    "packages/deepmerge-safe/package.json",
  ]);
  await assert.rejects(
    glob.glob("**/*", {
      signal: AbortSignal.abort(new Error("cancelled")),
    }),
    /cancelled/
  );
});

test("deepmerge preserves nested merges, arrays, symbols, dates and custom options", () => {
  const symbol = Symbol("theme");
  const date = new Date();
  const left = { nested: { a: 1 }, array: [{ a: 1 }], date, [symbol]: "dark" };
  const right = { nested: { b: 2 }, array: [{ b: 2 }] };
  const result = merge(left, right);
  assert.deepEqual(result.nested, { a: 1, b: 2 });
  assert.deepEqual(result.array, [{ a: 1 }, { b: 2 }]);
  assert.notEqual(result.array[0], left.array[0]);
  assert.equal(result.date, date);
  assert.equal(result[symbol], "dark");
  assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
  assert.deepEqual(
    merge(
      { a: [1] },
      { a: [2] },
      {
        arrayMerge: (_target, source) => source,
      }
    ),
    { a: [2] }
  );
  assert.deepEqual(
    merge(
      { a: { x: 1 } },
      { a: { y: 2 } },
      {
        customMerge: (key) => (key === "a" ? () => "custom" : undefined),
      }
    ),
    { a: "custom" }
  );
  assert.equal(merge({}, left, { clone: false }).nested, left.nested);
  assert.throws(() => merge.all({}), /array/);
});

test("deepmerge rejects prototype-poisoning keys from BOTH inputs and nested arrays", () => {
  const payload = JSON.parse(
    '{"__proto__":{"poisoned":true},"constructor":{"prototype":{"poisoned":true}},"prototype":{"poisoned":true},"safe":1}'
  );
  for (const [left, right] of [
    [payload, {}],
    [{}, payload],
    [Object.assign(Object.create(null), payload), {}],
    [{}, Object.assign(Object.create(null), payload)],
    [payload, payload],
  ]) {
    const result = merge(left, right);
    assert.deepEqual(result, { safe: 1 });
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.poisoned, undefined);
  }
  assert.deepEqual(merge({}, { nested: payload, list: [payload] }), {
    nested: { safe: 1 },
    list: [{ safe: 1 }],
  });
  assert.equal({}.poisoned, undefined);
});

test("HeroUI and build tooling resolve the hardened merge implementation", () => {
  for (const consumer of [
    "@heroui/theme",
    "jest-config",
    "@rollup/plugin-node-resolve",
  ]) {
    const fromConsumer = createRequire(require.resolve(consumer));
    assert.equal(fromConsumer("deepmerge"), merge);
    assert.deepEqual(
      fromConsumer("deepmerge")(
        { colors: { a: "red" } },
        { colors: { b: "blue" } }
      ),
      { colors: { a: "red", b: "blue" } }
    );
  }
});

test("lockfiles contain portable URLs and no dangling local links", () => {
  for (const file of [
    "package-lock.json",
    "packages/shopstr-mcp/package-lock.json",
  ]) {
    const lock = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [name, entry] of Object.entries(lock.packages)) {
      assert.ok(
        !entry.resolved?.includes("package-firewall.replit.internal"),
        name
      );
      assert.ok(!entry.link, `unexpected link: ${name}`);
      assert.ok(!name.includes("/packages/"), `dangling override: ${name}`);
    }
  }
});
