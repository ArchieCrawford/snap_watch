import { describe, expect, it } from "vitest";
import { computeScoreBreakdown, normalizeQuery, scoreAmplifier } from "./scoring";

describe("normalizeQuery", () => {
  it("normalizes spaces and leading hashes", () => {
    expect(normalizeQuery("  ##Hello   World  ")).toBe("hello world");
  });
});

describe("computeScoreBreakdown", () => {
  it("returns stable breakdown and total", () => {
    const result = computeScoreBreakdown({
      originLagMinutes: 0,
      engagement: {
        replies: 5,
        recasts: 3,
        reactions: 4,
        uniqueEngagers: 10,
        sustainedDays: 3,
        earlyEngagements: 6,
        earlyEngagers: 4,
        adoptionLagMinutes: 20,
      },
      author: {
        accountAgeDays: 200,
        followReciprocity: 0.5,
        repeatTextCount: 0,
        castCount: 40,
        replyRate: 0.2,
      },
    });

    expect(result.origin.score).toBeGreaterThan(0);
    expect(result.early_amp.score).toBeGreaterThan(0);
    expect(result.downstream.score).toBeGreaterThan(0);
    expect(result.quality.score).toBeGreaterThan(0);
    expect(result.penalties.score).toBe(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it("applies spam penalties", () => {
    const result = computeScoreBreakdown({
      originLagMinutes: 120,
      engagement: {
        replies: 0,
        recasts: 0,
        reactions: 1,
        uniqueEngagers: 1,
        sustainedDays: 0,
        earlyEngagements: 0,
        earlyEngagers: 0,
      },
      author: {
        accountAgeDays: 2,
        followReciprocity: 0.05,
        repeatTextCount: 4,
        castCount: 120,
        replyRate: 0.01,
      },
    });

    expect(result.penalties.reasons).toEqual(
      expect.arrayContaining([
        "very_new_account",
        "repeated_identical_text",
        "high_volume_low_reply",
        "low_follow_reciprocity",
      ]),
    );
    expect(result.penalties.score).toBeGreaterThan(0);
  });
});

describe("scoreAmplifier", () => {
  it("decays by time and reputation", () => {
    const result = scoreAmplifier({
      engagements: 5,
      lagMinutes: 30,
      windowMinutes: 180,
      author: {
        accountAgeDays: 365,
        followReciprocity: 0.6,
        repeatTextCount: 0,
        castCount: 10,
        replyRate: 0.2,
      },
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.explain.timeDecay).toBeLessThan(1);
  });
});
