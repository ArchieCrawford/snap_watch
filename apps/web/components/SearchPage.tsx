"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ResultCard, SearchBar, Tabs } from "@snapsearch/ui";

type SearchData = {
  query: string;
  cursor: number;
  results: {
    people: Array<any>;
    casts: Array<any>;
    topics: Array<any>;
  };
};

type MiniAppState = {
  isMiniApp: boolean;
  fid?: number;
  quickAuthToken?: string;
};

const getApiBase = () => {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  );
};

const tabs = [
  { id: "latest", label: "Latest" },
  { id: "people", label: "People" },
  { id: "ideas", label: "Ideas" },
  { id: "threads", label: "Threads" },
];

export default function SearchPage({
  initialQuery,
  initialData,
  initialTab,
}: {
  initialQuery: string;
  initialData: SearchData | null;
  initialTab?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery || "");
  const [data, setData] = useState<SearchData | null>(initialData);
  const [activeTab, setActiveTab] = useState(
    tabs.find((tab) => tab.id === initialTab)?.id || "latest",
  );
  const [miniApp, setMiniApp] = useState<MiniAppState>({ isMiniApp: false });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    sdk
      .isInMiniApp()
      .then(async (isMiniApp) => {
        if (!active) return;
        if (isMiniApp) {
          await sdk.actions.ready();
          const ctx = (await sdk.context.catch(() => null)) as any;
          setMiniApp({ isMiniApp, fid: ctx?.user?.fid });
        } else {
          setMiniApp({ isMiniApp: false });
        }
      })
      .catch(() => {
        setMiniApp({ isMiniApp: false });
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = () => {
    if (!query.trim()) return;
    const url = `${getApiBase()}/search?q=${encodeURIComponent(query)}&cursor=0&limit=20`;
    startTransition(async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as SearchData;
        setData(json);
        router.replace(`/?q=${encodeURIComponent(query)}&tab=${activeTab}`);
      } catch {
        return;
      }
    });
  };

  const handleConnect = async () => {
    try {
      const result = await sdk.quickAuth.getToken();
      setMiniApp((state) => ({ ...state, quickAuthToken: result.token }));
    } catch {
      return;
    }
  };

  const threads = useMemo(() => {
    const map = new Map<string, any>();
    for (const cast of data?.results.casts || []) {
      const root = cast.root_parent_hash || cast.hash;
      if (!map.has(root)) {
        map.set(root, { ...cast, root_hash: root });
      }
    }
    return Array.from(map.values());
  }, [data]);

  const results = useMemo(() => {
    if (!data) return [];
    if (activeTab === "people") return data.results.people || [];
    if (activeTab === "ideas") return data.results.topics || [];
    if (activeTab === "threads") return threads;
    return data.results.casts || [];
  }, [data, activeTab, threads]);

  return (
    <div className="space-y-10">
      <section className="rounded-[36px] border border-white/60 bg-white/70 p-8 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
              Search the social graph
            </p>
            <h1 className="text-4xl font-semibold text-ink">
              Map who sparked it, who amplified it, and why it mattered.
            </h1>
          </div>
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={handleSubmit}
            loading={isPending}
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Tabs
              tabs={tabs}
              activeId={activeTab}
              onChange={setActiveTab}
            />
            {miniApp.isMiniApp ? (
              <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-xs font-semibold text-ink/70">
                <span>Mini App</span>
                {miniApp.fid ? <span>FID {miniApp.fid}</span> : null}
                {!miniApp.quickAuthToken ? (
                  <button
                    className="rounded-full bg-ink px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white"
                    onClick={handleConnect}
                  >
                    Connect
                  </button>
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-600">
                    Connected
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/40">
                Read-only mode
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        {!data ? (
          <div className="rounded-3xl border border-white/50 bg-white/60 p-8 text-sm text-ink/60">
            Try "snapchain", "warpcast", or "openrank" to see causality trails.
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-3xl border border-white/50 bg-white/60 p-8 text-sm text-ink/60">
            No results yet. Try a different query.
          </div>
        ) : (
          <div className="grid gap-6">
            {results.map((item: any) => {
              if (activeTab === "people") {
                const title = item.display_name || item.username || `FID ${item.fid}`;
                return (
                  <ResultCard
                    key={`person-${item.fid}`}
                    title={title}
                    snippet={item.bio}
                    meta={item.username ? `@${item.username}` : `FID ${item.fid}`}
                    score={item.score || 0}
                    explain={item.explain || {}}
                    onClick={() => router.push(`/user/${item.fid}`)}
                  />
                );
              }

              if (activeTab === "ideas") {
                return (
                  <ResultCard
                    key={`topic-${item.topic_id}`}
                    title={`#${item.normalized_query}`}
                    snippet={"Track origin + spread for this idea"}
                    meta={`Topic ${item.topic_id}`}
                    score={item.score || 0}
                    explain={item.explain || {}}
                    onClick={() => router.push(`/topic/${item.topic_id}`)}
                  />
                );
              }

              if (activeTab === "threads") {
                return (
                  <ResultCard
                    key={`thread-${item.root_hash}`}
                    title={`Thread ${item.root_hash.slice(0, 8)}`}
                    snippet={item.text}
                    meta={`FID ${item.fid}`}
                    score={item.score || 0}
                    explain={item.explain || {}}
                    onClick={() => router.push(`/thread/${item.root_hash}`)}
                  />
                );
              }

              return (
                <ResultCard
                  key={`cast-${item.hash}`}
                  title={`FID ${item.fid}`}
                  snippet={item.text}
                  meta={`Cast ${item.hash.slice(0, 8)}`}
                  score={item.score || 0}
                  explain={item.explain || {}}
                  onClick={() => router.push(`/thread/${item.root_parent_hash || item.hash}`)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
