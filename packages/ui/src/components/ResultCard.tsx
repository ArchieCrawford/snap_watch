import { ExplainPanel } from "./ExplainPanel";
import { ScoreBadge } from "./ScoreBadge";

export type ResultCardProps = {
  title: string;
  snippet?: string | null;
  meta?: string | null;
  score: number;
  explain: Record<string, unknown>;
  onClick?: () => void;
};

export const ResultCard = ({
  title,
  snippet,
  meta,
  score,
  explain,
  onClick,
}: ResultCardProps) => {
  return (
    <div
      className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          {meta ? (
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
              {meta}
            </p>
          ) : null}
        </div>
        <ScoreBadge score={score} />
      </div>
      {snippet ? (
        <p className="mt-3 text-sm text-ink/70">{snippet}</p>
      ) : null}
      <div className="mt-4">
        <ExplainPanel explain={explain} />
      </div>
    </div>
  );
};
