import type { FormEvent } from "react";
import { cn } from "../utils";

export type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  loading?: boolean;
};

export const SearchBar = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Search casts, people, ideas",
  className,
  loading,
}: SearchBarProps) => {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex w-full items-center gap-3 rounded-full border border-white/40 bg-white/80 px-6 py-3 shadow-glow backdrop-blur",
        className,
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/40">
        Search
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-base text-ink placeholder:text-ink/50 focus:outline-none"
      />
      {loading ? (
        <span className="text-sm text-ink/60">Searching...</span>
      ) : (
        <button
          type="submit"
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink/90"
        >
          Go
        </button>
      )}
    </form>
  );
};
