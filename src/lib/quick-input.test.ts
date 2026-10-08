import { describe, expect, it } from "vitest";
import { parseQuickInput, parseTimeToken, tokenizeQuickInput } from "@/lib/quick-input";
import { MAX_TAG_LENGTH } from "@/lib/types";

describe("quick-input", () => {
  it("parses title, tags and priority", () => {
    expect(parseQuickInput("买牛奶 #日用品 p1")).toEqual({
      title: "买牛奶",
      tags: ["日用品"],
      priority: "urgent",
      time: null,
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

  it("parses a standalone clock time and strips it from the title", () => {
    expect(parseQuickInput("部门例会 17:00")).toEqual({
      title: "部门例会",
      tags: [],
      priority: null,
      time: "17:00",
    });
  });

  it("pads a loose time into the HH:mm storage format", () => {
    expect(parseQuickInput("晨会 9:30").time).toBe("09:30");
  });

  it("keeps the first time only — a later one stays literal text", () => {
    const parsed = parseQuickInput("例会 9:00 18:00");
    expect(parsed.time).toBe("09:00");
    expect(parsed.title).toBe("例会 18:00");
    const kinds = tokenizeQuickInput("例会 9:00 18:00").map((t) => t.kind);
    expect(kinds.filter((k) => k === "time")).toHaveLength(1);
  });

  it("accepts a time and a priority together — they are independent", () => {
    const parsed = parseQuickInput("复盘 17:00 p1");
    expect(parsed.time).toBe("17:00");
    expect(parsed.priority).toBe("urgent");
    expect(parsed.title).toBe("复盘");
  });

  it("does not recognise an impossible clock time", () => {
    expect(parseQuickInput("版本 25:00 发布").time).toBeNull();
    expect(parseQuickInput("版本 12:99 发布").time).toBeNull();
    expect(parseQuickInput("版本 25:00 发布").title).toBe("版本 25:00 发布");
  });

  it("parses 12-hour forms the way they are said out loud", () => {
    expect(parseQuickInput("standup 10am").time).toBe("10:00");
    expect(parseQuickInput("standup 10 am").time).toBe("10:00");
    expect(parseQuickInput("standup 10:00 am").time).toBe("10:00");
    expect(parseQuickInput("lunch 12:30pm").time).toBe("12:30");
    expect(parseQuickInput("deadline 10PM").time).toBe("22:00");
    expect(parseQuickInput("midnight 12am").time).toBe("00:00");
    // The suffix rides out of the title with the numbers.
    expect(parseQuickInput("standup 10am").title).toBe("standup");
  });

  it("refuses 12-hour shapes that name no real moment", () => {
    expect(parseQuickInput("warn 13pm").time).toBeNull();
    expect(parseQuickInput("warn 0am").time).toBeNull();
    expect(parseQuickInput("warn 13pm").title).toBe("warn 13pm");
  });

  it("does not recognise a bare hour as a time", () => {
    expect(parseQuickInput("chapter 10 done").time).toBeNull();
    expect(parseQuickInput("chapter 10 done").title).toBe("chapter 10 done");
  });

  it("does not recognise a time inside a word", () => {
    expect(parseQuickInput("v1.2 更新日志").time).toBeNull();
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
    expect(parseQuickInput("   ")).toEqual({
      title: "",
      tags: [],
      priority: null,
      time: null,
    });
  });

  describe("parseTimeToken", () => {
    it("validates and normalises", () => {
      expect(parseTimeToken("0:00")).toBe("00:00");
      expect(parseTimeToken("23:59")).toBe("23:59");
      expect(parseTimeToken("24:00")).toBeNull();
      expect(parseTimeToken("12:5")).toBeNull();
      expect(parseTimeToken("abc")).toBeNull();
    });

    it("normalises the 12-hour clock into the 24-hour storage format", () => {
      expect(parseTimeToken("9:30am")).toBe("09:30");
      expect(parseTimeToken("12pm")).toBe("12:00");
      expect(parseTimeToken("11 Pm")).toBe("23:00");
      expect(parseTimeToken("10")).toBeNull();
    });
  });
});
