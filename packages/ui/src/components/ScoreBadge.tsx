import { cn } from "../utils";

export type ScoreBadgeProps = {
  score: number;
  className?: string;
};

const scoreColor = (score: number) => {
  if (score >= 300) return "bg-emerald-600 text-white";
  if (score >= 150) return "bg-sky-600 text-white";
  if (score >= 60) return "bg-amber-500 text-white";
  return "bg-slate-200 text-slate-700";
};

export const ScoreBadge = ({ score, className }: ScoreBadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
        scoreColor(score),
        className,
      )}
    >
      Score {Math.round(score)}
    </span>
  );
};
