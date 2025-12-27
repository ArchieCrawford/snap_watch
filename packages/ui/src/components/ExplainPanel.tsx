export type ExplainPanelProps = {
  explain: Record<string, unknown>;
};

export const ExplainPanel = ({ explain }: ExplainPanelProps) => {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-700">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        Why this ranked
      </summary>
      <pre className="mt-3 whitespace-pre-wrap text-[11px] leading-relaxed">
        {JSON.stringify(explain, null, 2)}
      </pre>
    </details>
  );
};
