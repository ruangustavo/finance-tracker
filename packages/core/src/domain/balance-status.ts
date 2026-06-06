export type BalanceStatus = "healthy" | "comfortable" | "tight" | "negative" | "critical";

export type BalanceStatusThresholds = Readonly<{
  healthyCents: number;
  comfortableCents: number;
  tightCents: number;
  negativeCents: number;
}>;

const DEFAULT_THRESHOLDS: BalanceStatusThresholds = {
  healthyCents: 200_000,
  comfortableCents: 100_000,
  tightCents: 0,
  negativeCents: -50_000,
};

export const BalanceStatus = {
  defaults: DEFAULT_THRESHOLDS,
  classify(
    balanceCents: number,
    thresholds: BalanceStatusThresholds = DEFAULT_THRESHOLDS,
  ): BalanceStatus {
    if (balanceCents > thresholds.healthyCents) return "healthy";
    if (balanceCents > thresholds.comfortableCents) return "comfortable";
    if (balanceCents > thresholds.tightCents) return "tight";
    if (balanceCents > thresholds.negativeCents) return "negative";
    return "critical";
  },
} as const;
