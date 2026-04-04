import { escapeRegExp } from "../string";

describe("escapeRegExp", () => {
  it("escapes regular expression special characters", () => {
    expect(escapeRegExp("c++ (guide)? [v2].*$")).toBe(
      "c\\+\\+ \\(guide\\)\\? \\[v2\\]\\.\\*\\$"
    );
  });
});
