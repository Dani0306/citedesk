import { describe, expect, it } from "vitest";
import { capReached, dailyAnswerCap, dailyRerankCap, DEFAULT_DAILY_ANSWER_CAP, DEFAULT_DAILY_RERANK_CAP, startOfUtcDay } from "@/lib/answer/cap";

describe("daily answer cap", () => {
  it("defaults when unset and reads a whole number otherwise", () => {
    expect(dailyAnswerCap({})).toBe(DEFAULT_DAILY_ANSWER_CAP);
    expect(dailyAnswerCap({ CITEDESK_DAILY_ANSWER_CAP: " 50 " })).toBe(50);
    expect(dailyAnswerCap({ CITEDESK_DAILY_ANSWER_CAP: "0" })).toBe(0);
    expect(dailyRerankCap({})).toBe(DEFAULT_DAILY_RERANK_CAP);
    expect(dailyRerankCap({ CITEDESK_DAILY_RERANK_CAP: "5" })).toBe(5);
    expect(() => dailyRerankCap({ CITEDESK_DAILY_RERANK_CAP: "x" })).toThrow(/CITEDESK_DAILY_RERANK_CAP/);
  });

  it("rejects nonsense loudly", () => {
    expect(() => dailyAnswerCap({ CITEDESK_DAILY_ANSWER_CAP: "lots" })).toThrow(/whole number/);
    expect(() => dailyAnswerCap({ CITEDESK_DAILY_ANSWER_CAP: "-1" })).toThrow(/whole number/);
    expect(() => dailyAnswerCap({ CITEDESK_DAILY_ANSWER_CAP: "2.5" })).toThrow(/whole number/);
  });

  it("is reached at the cap, not one before", () => {
    expect(capReached(199, 200)).toBe(false);
    expect(capReached(200, 200)).toBe(true);
    expect(capReached(0, 0)).toBe(true);
  });

  it("counts from midnight UTC, whatever the local time zone", () => {
    expect(startOfUtcDay(new Date("2026-11-06T23:30:00-05:00")).toISOString()).toBe("2026-11-07T00:00:00.000Z");
    expect(startOfUtcDay(new Date("2026-11-06T04:59:00Z")).toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });
});
