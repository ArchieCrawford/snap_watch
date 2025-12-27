export type EngagementStats = {
  replies: number;
  recasts: number;
  reactions: number;
  uniqueEngagers: number;
  sustainedDays: number;
  earlyEngagements: number;
  earlyEngagers: number;
  adoptionLagMinutes?: number;
};

export type AuthorStats = {
  accountAgeDays: number;
  followReciprocity: number;
  repeatTextCount: number;
  castCount: number;
  replyRate: number;
};

export type ScoreBreakdown = {
  origin: {
    score: number;
    originLagMinutes: number;
    reputation: number;
    adoptionLagMinutes: number;
  };
  early_amp: {
    score: number;
    earlyEngagements: number;
    earlyEngagers: number;
    windowMinutes: number;
    decayBase: number;
  };
  downstream: {
    score: number;
    uniqueEngagers: number;
    totalEngagements: number;
  };
  quality: {
    score: number;
    replyRatio: number;
    sustainedDays: number;
  };
  penalties: {
    score: number;
    reasons: string[];
  };
  total: number;
};

export type ScoreInput = {
  originLagMinutes: number;
  engagement: EngagementStats;
  author: AuthorStats;
  earlyWindowMinutes?: number;
};

export type AmplifierInput = {
  engagements: number;
  lagMinutes: number;
  windowMinutes: number;
  author: AuthorStats;
};

export type AmplifierScore = {
  score: number;
  explain: {
    base: number;
    timeDecay: number;
    reputation: number;
  };
};
