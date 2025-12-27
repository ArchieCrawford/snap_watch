import Link from "next/link";
import { ResultCard } from "@snapsearch/ui";
import { fetchUser } from "../../../lib/api";

export default async function UserPage({ params }: { params: { fid: string } }) {
  const data = await fetchUser(params.fid);

  if (!data || !data.profile) {
    return (
      <div className="rounded-3xl border border-white/50 bg-white/70 p-8 text-sm text-ink/70">
        User not found.
      </div>
    );
  }

  const profile = data.profile;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
          Profile
        </p>
        <h1 className="text-3xl font-semibold text-ink">
          {profile.display_name || profile.username || `FID ${profile.fid}`}
        </h1>
        <p className="text-sm text-ink/60">
          @{profile.username || "unknown"} · FID {profile.fid}
        </p>
      </header>

      <section className="rounded-3xl border border-white/50 bg-white/70 p-6">
        <h2 className="text-lg font-semibold text-ink">Reputation</h2>
        <div className="mt-4 grid gap-4 text-sm text-ink/70 md:grid-cols-2">
          <div>Account age: {Math.round(data.reputation.accountAgeDays)} days</div>
          <div>Follow reciprocity: {data.reputation.followReciprocity.toFixed(2)}</div>
          <div>Cast count: {data.reputation.castCount}</div>
          <div>Reply rate: {data.reputation.replyRate.toFixed(2)}</div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Top topics</h2>
        <div className="grid gap-6">
          {data.top_topics?.length ? (
            data.top_topics.map((topic: any) => (
              <Link key={topic.topic_id} href={`/topic/${topic.topic_id}`}>
                <ResultCard
                  title={`#${topic.normalized_query}`}
                  snippet={`Events: ${topic.events}`}
                  meta={`Topic ${topic.topic_id}`}
                  score={Number(topic.events) * 10}
                  explain={{ origin: { score: Number(topic.events) * 10 } }}
                />
              </Link>
            ))
          ) : (
            <div className="rounded-3xl border border-white/40 bg-white/70 p-6 text-sm text-ink/60">
              No topic activity yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
