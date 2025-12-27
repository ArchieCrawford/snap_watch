import Link from "next/link";
import { ResultCard } from "@snapsearch/ui";
import { fetchTopicOrigin, fetchTopicSpread } from "../../../lib/api";

export default async function TopicPage({
  params,
}: {
  params: { id: string };
}) {
  const origin = await fetchTopicOrigin(params.id);
  const spread = await fetchTopicSpread(params.id);

  if (!origin) {
    return (
      <div className="rounded-3xl border border-white/50 bg-white/70 p-8 text-sm text-ink/70">
        Topic not found.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
          Topic
        </p>
        <h1 className="text-3xl font-semibold text-ink">
          #{origin.normalized_query}
        </h1>
        <p className="text-sm text-ink/60">
          Origin timeline and amplification signals for this idea.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">Origin timeline</h2>
        <div className="grid gap-6">
          {origin.origin?.length ? (
            origin.origin.map((item: any) => (
              <Link
                key={item.hash}
                href={`/thread/${item.hash}`}
                className="block"
              >
                <ResultCard
                  title={`FID ${item.fid}`}
                  snippet={item.text}
                  meta={new Date(item.ts).toLocaleString()}
                  score={item.score || 0}
                  explain={item.explain || {}}
                />
              </Link>
            ))
          ) : (
            <div className="rounded-3xl border border-white/40 bg-white/70 p-6 text-sm text-ink/60">
              No casts matched yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">Spread highlights</h2>
        <div className="rounded-3xl border border-white/40 bg-white/70 p-6 text-sm text-ink/70">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/40">
                Replies
              </p>
              <p className="text-lg font-semibold">{spread?.totals?.replies ?? 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/40">
                Recasts
              </p>
              <p className="text-lg font-semibold">{spread?.totals?.recasts ?? 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/40">
                Reactions
              </p>
              <p className="text-lg font-semibold">{spread?.totals?.reactions ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-6">
          {spread?.top_amplifiers?.length ? (
            spread.top_amplifiers.map((item: any) => (
              <Link key={item.fid} href={`/user/${item.fid}`} className="block">
                <ResultCard
                  title={`FID ${item.fid}`}
                  snippet={`Early engagements: ${item.engagements}`}
                  meta={`Amplifier score`}
                  score={item.score || 0}
                  explain={item.explain || {}}
                />
              </Link>
            ))
          ) : (
            <div className="rounded-3xl border border-white/40 bg-white/70 p-6 text-sm text-ink/60">
              No amplifiers recorded yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
