import { cn } from "../utils";

export type Tab = {
  id: string;
  label: string;
};

export type TabsProps = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

export const Tabs = ({ tabs, activeId, onChange, className }: TabsProps) => {
  return (
    <div
      className={cn(
        "inline-flex rounded-full border border-white/40 bg-white/70 p-1 backdrop-blur",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
              active
                ? "bg-ink text-white"
                : "text-ink/60 hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
