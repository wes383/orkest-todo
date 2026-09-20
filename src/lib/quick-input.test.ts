import { describe, expect, it } from "vitest";
import { parseQuickInput, tokenizeQuickInput } from "@/lib/quick-input";
import { MAX_TAG_LENGTH } from "@/lib/types";

describe("quick-input", () => {
  it("parses title, tags and priority", () => {
    expect(parseQuickInput("买牛奶 #日用品 p1")).toEqual({
      title: "买牛奶",
      tags: ["日用品"],
      priority: "urgent",
    });
  });

  it("keeps the first priority only — a later p# stays literal text", () => {
    const parsed = parseQuickInput("写报告 p1 p4");
    expect(parsed.priority).toBe("urgent");
    expect(parsed.title).toBe("写报告 p4");
    // …and the mirror paints it the same way: one priority token, one text run.
    const kinds = tokenizeQuickInput("写报告 p1 p4").map((t) => t.kind);
    expect(kinds.filter((k) => k === "priority")).toHaveLength(1);
  });

  it("does not recognise p# inside a word", () => {
    expect(parseQuickInput("app1 文案p2初稿").priority).toBeNull();
  });

  it("a bare # is text, not a tag", () => {
    expect(parseQuickInput("看 # 一下").tags).toEqual([]);
  });

  it("deduplicates repeated tags", () => {
    expect(parseQuickInput("#a x #a").tags).toEqual(["a"]);
  });

  it("demotes an over-long tag to plain text", () => {
    const longTag = `#${"x".repeat(MAX_TAG_LENGTH + 1)}`;
    const parsed = parseQuickInput(`t ${longTag}`);
    expect(parsed.tags).toEqual([]);
    expect(parsed.title).toContain(longTag);
  });

  it("an empty field parses to an empty title", () => {
    expect(parseQuickInput("   ")).toEqual({ title: "", tags: [], priority: null });
  });
});
