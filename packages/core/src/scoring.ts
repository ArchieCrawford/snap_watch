import type { AmplifierInput, AmplifierScore, ScoreBreakdown, ScoreInput } from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const normalizeQuery = (query: string) => {
  return query
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const computeReputation = (input: ScoreInput["author"]) => {
  const ageScore = clamp(input.accountAgeDays / 365, 0, 1);
  const reciprocityScore = clamp(input.followReciprocity, 0, 1);
  const replyRateScore = clamp(input.replyRate * 2, 0, 1);
  return clamp(0.2 + 0.5 * ageScore + 0.2 * reciprocityScore + 0.1 * replyRateScore, 0.1, 1.2);
};

export const computeScoreBreakdown = (input: ScoreInput): ScoreBreakdown => {
  const reputation = computeReputation(input.author);
  const adoptionLagMinutes =
    input.engagement.adoptionLagMinutes ?? Math.min(180, input.originLagMinutes + 60);
  const lagFactor = 1 / (1 + input.originLagMinutes / 30);
  const adoptionFactor = 1 / (1 + adoptionLagMinutes / 60);
  const originScore = 100 * lagFactor * (0.6 + 0.4 * adoptionFactor) * reputation;

  const totalEngagements =
    input.engagement.replies +
    input.engagement.recasts +
    input.engagement.reactions;

  const earlyWindowMinutes = input.earlyWindowMinutes ?? 180;
  const decayBase = Math.exp(-input.originLagMinutes / Math.max(earlyWindowMinutes, 1));
  const earlyScoreRaw =
    input.engagement.earlyEngagements * 1.5 +
    input.engagement.earlyEngagers * 2;
  const earlyScore = earlyScoreRaw * decayBase * (0.7 + 0.6 * reputation);

  const downstreamScore =
    input.engagement.uniqueEngagers * 2 + totalEngagements * 0.75;

  const replyRatio = totalEngagements
    ? input.engagement.replies / totalEngagements
    : 0;
  const qualityScore =
    input.engagement.replies * 2.5 +
    input.engagement.sustainedDays * 8 +
    input.engagement.uniqueEngagers * 0.5;

  const penalties: string[] = [];
  let penaltyScore = 0;

  if (input.author.accountAgeDays < 14) {
    penalties.push("very_new_account");
    penaltyScore += 15;
  }
  if (input.author.repeatTextCount > 2) {
    penalties.push("repeated_identical_text");
    penaltyScore += 10;
  }
  if (input.author.castCount > 50 && input.author.replyRate < 0.05) {
    penalties.push("high_volume_low_reply");
    penaltyScore += 15;
  }
  if (input.author.followReciprocity < 0.1) {
    penalties.push("low_follow_reciprocity");
    penaltyScore += 10;
  }

  const total = clamp(
    originScore + earlyScore + downstreamScore + qualityScore - penaltyScore,
    0,
    1000,
  );

  return {
    origin: {
      score: Math.round(originScore * 100) / 100,
      originLagMinutes: input.originLagMinutes,
      reputation: Math.round(reputation * 100) / 100,
      adoptionLagMinutes,
    },
    early_amp: {
      score: Math.round(earlyScore * 100) / 100,
      earlyEngagements: input.engagement.earlyEngagements,
      earlyEngagers: input.engagement.earlyEngagers,
      windowMinutes: earlyWindowMinutes,
      decayBase: Math.round(decayBase * 100) / 100,
    },
    downstream: {
      score: Math.round(downstreamScore * 100) / 100,
      uniqueEngagers: input.engagement.uniqueEngagers,
      totalEngagements,
    },
    quality: {
      score: Math.round(qualityScore * 100) / 100,
      replyRatio: Math.round(replyRatio * 100) / 100,
      sustainedDays: input.engagement.sustainedDays,
    },
    penalties: {
      score: penaltyScore,
      reasons: penalties,
    },
    total: Math.round(total * 100) / 100,
  };
};

export const scoreAmplifier = (input: AmplifierInput): AmplifierScore => {
  const reputation = computeReputation(input.author);
  const timeDecay = Math.exp(-input.lagMinutes / Math.max(input.windowMinutes, 1));
  const base = input.engagements * 2;
  const score = base * timeDecay * (0.6 + 0.4 * reputation);
  return {
    score: Math.round(score * 100) / 100,
    explain: {
      base: Math.round(base * 100) / 100,
      timeDecay: Math.round(timeDecay * 100) / 100,
      reputation: Math.round(reputation * 100) / 100,
    },
  };
};
