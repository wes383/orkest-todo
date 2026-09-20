import { describe, expect, it } from "vitest";
import { linkify } from "@/lib/linkify";

describe("linkify", () => {
  it("leaves plain text untouched", () => {
    expect(linkify("买牛奶")).toEqual([{ kind: "text", text: "买牛奶" }]);
  });

  it("links an https URL", () => {
    expect(linkify("见 https://example.com/spec 这里")).toEqual([
      { kind: "text", text: "见 " },
      { kind: "link", text: "https://example.com/spec", href: "https://example.com/spec" },
      { kind: "text", text: " 这里" },
    ]);
  });

  it("upgrades a bare www. host to https", () => {
    expect(linkify("www.example.com")).toEqual([
      { kind: "link", text: "www.example.com", href: "https://www.example.com" },
    ]);
  });

  it("strips trailing sentence punctuation", () => {
    expect(linkify("看 https://a.dev/x.")).toEqual([
      { kind: "text", text: "看 " },
      { kind: "link", text: "https://a.dev/x", href: "https://a.dev/x" },
      { kind: "text", text: "." },
    ]);
  });

  it("keeps balanced parentheses, drops an unmatched closer", () => {
    expect(linkify("https://en.wikipedia.org/wiki/Todo_(disambiguation)")).toEqual([
      {
        kind: "link",
        text: "https://en.wikipedia.org/wiki/Todo_(disambiguation)",
        href: "https://en.wikipedia.org/wiki/Todo_(disambiguation)",
      },
    ]);
    expect(linkify("(https://a.dev/x)")).toEqual([
      { kind: "text", text: "(" },
      { kind: "link", text: "https://a.dev/x", href: "https://a.dev/x" },
      { kind: "text", text: ")" },
    ]);
  });

  it("refuses non-http schemes", () => {
    expect(linkify("file:///etc/passwd")).toEqual([
      { kind: "text", text: "file:///etc/passwd" },
    ]);
  });

  it("handles several links in one note", () => {
    const out = linkify("a https://x.dev b www.y.dev c");
    expect(out.filter((s) => s.kind === "link")).toHaveLength(2);
  });
});
