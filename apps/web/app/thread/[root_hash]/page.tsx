import Link from "next/link";
import { ResultCard } from "@snapsearch/ui";
import { fetchThread } from "../../../lib/api";

export default async function ThreadPage({
  params,
}: {
  params: { root_hash: string };
}) {
  const data = await fetchThread(params.root_hash);

  if (!data || !data.root) {
    return (
      <div className="rounded-3xl border border-white/50 bg-white/70 p-8 text-sm text-ink/70">
        Thread not found.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
          Thread
        </p>
        <h1 className="text-2xl font-semibold text-ink">
          Root {data.root.hash.slice(0, 10)}
        </h1>
        <p className="text-sm text-ink/60">FID {data.root.fid}</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Root cast</h2>
        <ResultCard
          title={`FID ${data.root.fid}`}
          snippet={data.root.text}
          meta={new Date(data.root.ts).toLocaleString()}
          score={0}
          explain={{}}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Replies</h2>
        <div className="grid gap-6">
          {data.casts?.length ? (
            data.casts
              .filter((cast: any) => cast.hash !== data.root.hash)
              .map((cast: any) => (
                <Link key={cast.hash} href={`/user/${cast.fid}`}>
                  <ResultCard
                    title={`FID ${cast.fid}`}
                    snippet={cast.text}
                    meta={new Date(cast.ts).toLocaleString()}
                    score={0}
                    explain={{}}
                  />
                </Link>
              ))
          ) : (
            <div className="rounded-3xl border border-white/40 bg-white/70 p-6 text-sm text-ink/60">
              No replies yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
