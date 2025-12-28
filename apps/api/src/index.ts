import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { computeScoreBreakdown, createServiceLogger, normalizeQuery } from "@snapsearch/core";
import { getPool, getSupabaseServiceClient } from "@snapsearch/db";

const log = createServiceLogger("api");
const server = Fastify({ logger: false });

let pool: ReturnType<typeof getPool>;
let supabase: ReturnType<typeof getSupabaseServiceClient>;

const toNumber = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const buildExplainFromScore = (score: number) => ({
  origin: { score, originLagMinutes: 0, reputation: 0, adoptionLagMinutes: 0 },
  early_amp: {
    score: 0,
    earlyEngagements: 0,
    earlyEngagers: 0,
    windowMinutes: 0,
    decayBase: 0,
  },
  downstream: { score: 0, uniqueEngagers: 0, totalEngagements: 0 },
  quality: { score: 0, replyRatio: 0, sustainedDays: 0 },
  penalties: { score: 0, reasons: [] as string[] },
  total: score,
});

server.register(helmet);
server.register(cors, { origin: true });

server.get("/", async () => {
  return {
    name: "snapsearch-api",
    status: "ok",
    health: "/health",
    search: "/search?q=...",
  };
});

server.addHook("onRequest", async (request) => {
  log.info("http_request", {
    method: request.method,
    url: request.url,
    requestId: request.id,
  });
});

server.addHook("onResponse", async (request, reply) => {
  log.info("http_response", {
    method: request.method,
    url: request.url,
    requestId: request.id,
    statusCode: reply.statusCode,
  });
});

server.setErrorHandler((error, request, reply) => {
  log.error("http_error", {
    requestId: request.id,
    method: request.method,
    url: request.url,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  if (!reply.sent) {
    reply.code(500);
    reply.send({ error: "Internal server error" });
  }
});

server.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

server.get("/search", async (request, reply) => {
  const { q, cursor, limit } = request.query as Record<string, string | undefined>;
  if (!q || q.trim().length === 0) {
    reply.code(400);
    return { error: "Missing query" };
  }

  const query = normalizeQuery(q);
  const pageSize = Math.min(50, Math.max(1, toNumber(limit, 20)));
  const offset = Math.max(0, toNumber(cursor, 0));

  const peopleLimit = Math.min(10, Math.ceil(pageSize / 3));
  const castLimit = Math.min(15, pageSize);
  const topicLimit = Math.min(5, Math.ceil(pageSize / 4));

  const peopleRows = await pool.query(
    `select fid, username, display_name, pfp_url, bio,
      greatest(similarity(username, $1), similarity(display_name, $1)) as score
     from fc_users
     where username % $1 or display_name % $1
     order by score desc nulls last
     limit $2 offset $3`,
    [query, peopleLimit, offset],
  );

  const castRows = await pool.query(
    `select hash, fid, ts, text, parent_hash, root_parent_hash,
      ts_rank_cd(text_tsv, plainto_tsquery('english', $1)) as rank
     from fc_casts
     where deleted = false and text_tsv @@ plainto_tsquery('english', $1)
     order by rank desc, ts desc
     limit $2 offset $3`,
    [query, castLimit, offset],
  );

  if (castRows.rows.length < castLimit) {
    const remaining = castLimit - castRows.rows.length;
    const fallbackRows = await pool.query(
      `select hash, fid, ts, text, parent_hash, root_parent_hash,
        similarity(text, $1) as rank
       from fc_casts
       where deleted = false and text % $1 and not (hash = any($2::text[]))
       order by rank desc nulls last, ts desc
       limit $3`,
      [query, castRows.rows.map((row) => row.hash), remaining],
    );
    castRows.rows.push(...fallbackRows.rows);
  }

  const topicRows = await pool.query(
    `select topic_id, normalized_query,
      greatest(similarity(normalized_query, $1), 0) as score
     from topics
     where normalized_query % $1 or normalized_query ilike '%' || $1 || '%'
     order by score desc nulls last
     limit $2 offset $3`,
    [query, topicLimit, offset],
  );

  const castHashes = castRows.rows.map((row) => row.hash);
  const castFids = castRows.rows.map((row) => row.fid);
  const peopleFids = peopleRows.rows.map((row) => row.fid);
  const fids = Array.from(new Set([...castFids, ...peopleFids]));

  const engagementMap = await loadEngagementStats(castHashes);
  const authorStatsMap = await loadAuthorStats(fids);

  const earliestCastTs = castRows.rows.length
    ? Math.min(
        ...castRows.rows.map((row) => new Date(row.ts).getTime()),
      )
    : Date.now();

  const casts = castRows.rows.map((row) => {
    const engagement = engagementMap[row.hash] || defaultEngagement();
    const author = authorStatsMap[row.fid] || defaultAuthorStats();
    const originLagMinutes = Math.max(
      0,
      (new Date(row.ts).getTime() - earliestCastTs) / 60000,
    );
    const explain = computeScoreBreakdown({
      originLagMinutes,
      engagement,
      author,
    });
    return {
      hash: row.hash,
      fid: row.fid,
      ts: row.ts,
      text: row.text,
      parent_hash: row.parent_hash,
      root_parent_hash: row.root_parent_hash,
      score: explain.total,
      explain,
    };
  });

  const people = peopleRows.rows.map((row) => {
    const author = authorStatsMap[row.fid] || defaultAuthorStats();
    const explain = computeScoreBreakdown({
      originLagMinutes: 0,
      engagement: defaultEngagement(),
      author,
    });
    return {
      fid: row.fid,
      username: row.username,
      display_name: row.display_name,
      pfp_url: row.pfp_url,
      bio: row.bio,
      score: explain.total,
      explain,
    };
  });

  const topics = topicRows.rows.map((row) => {
    const score = Math.round((row.score || 0) * 100);
    return {
      topic_id: row.topic_id,
      normalized_query: row.normalized_query,
      score,
      explain: buildExplainFromScore(score),
    };
  });

  return {
    query,
    cursor: offset + pageSize,
    results: { people, casts, topics },
  };
});

server.get("/topic/resolve", async (request, reply) => {
  const { q } = request.query as Record<string, string | undefined>;
  if (!q) {
    reply.code(400);
    return { error: "Missing query" };
  }
  const normalized = normalizeQuery(q);
  if (!normalized) {
    reply.code(400);
    return { error: "Invalid query" };
  }

  const result = await pool.query(
    `insert into topics (normalized_query)
     values ($1)
     on conflict (normalized_query) do update set normalized_query = excluded.normalized_query
     returning topic_id, normalized_query`,
    [normalized],
  );

  const suggestions = await pool.query(
    `select topic_id, normalized_query
     from topics
     where normalized_query % $1 or normalized_query ilike '%' || $1 || '%'
     order by similarity(normalized_query, $1) desc nulls last
     limit 5`,
    [normalized],
  );

  return {
    topic_id: result.rows[0].topic_id,
    normalized_query: result.rows[0].normalized_query,
    suggestions: suggestions.rows,
  };
});

server.get("/topic/:topic_id/origin", async (request, reply) => {
  const { topic_id } = request.params as Record<string, string>;
  const topicResult = await pool.query(
    "select topic_id, normalized_query from topics where topic_id = $1",
    [topic_id],
  );
  if (topicResult.rows.length === 0) {
    reply.code(404);
    return { error: "Topic not found" };
  }

  const topic = topicResult.rows[0];
  const castsResult = await pool.query(
    `select hash, fid, ts, text, parent_hash, root_parent_hash
     from fc_casts
     where deleted = false and text_tsv @@ plainto_tsquery('english', $1)
     order by ts asc
     limit 50`,
    [topic.normalized_query],
  );

  const castHashes = castsResult.rows.map((row) => row.hash);
  const engagementMap = await loadEngagementStats(castHashes);
  const authorStatsMap = await loadAuthorStats(
    castsResult.rows.map((row) => row.fid),
  );

  const firstTs = castsResult.rows.length
    ? new Date(castsResult.rows[0].ts).getTime()
    : Date.now();

  const origin = castsResult.rows.map((row) => {
    const engagement = engagementMap[row.hash] || defaultEngagement();
    const author = authorStatsMap[row.fid] || defaultAuthorStats();
    const originLagMinutes = Math.max(
      0,
      (new Date(row.ts).getTime() - firstTs) / 60000,
    );
    const explain = computeScoreBreakdown({
      originLagMinutes,
      engagement,
      author,
    });
    return {
      hash: row.hash,
      fid: row.fid,
      ts: row.ts,
      text: row.text,
      score: explain.total,
      explain,
    };
  });

  const topOriginators = aggregateTopFids(origin);

  return {
    topic_id: topic.topic_id,
    normalized_query: topic.normalized_query,
    origin,
    top_originators: topOriginators,
  };
});

server.get("/topic/:topic_id/spread", async (request, reply) => {
  const { topic_id } = request.params as Record<string, string>;
  const topicResult = await pool.query(
    "select topic_id, normalized_query from topics where topic_id = $1",
    [topic_id],
  );
  if (topicResult.rows.length === 0) {
    reply.code(404);
    return { error: "Topic not found" };
  }

  const topic = topicResult.rows[0];
  const castsResult = await pool.query(
    `select hash, fid, ts, text
     from fc_casts
     where deleted = false and text_tsv @@ plainto_tsquery('english', $1)
     order by ts asc
     limit 100`,
    [topic.normalized_query],
  );

  if (castsResult.rows.length === 0) {
    return {
      topic_id: topic.topic_id,
      normalized_query: topic.normalized_query,
      origin: null,
      totals: defaultEngagement(),
      top_amplifiers: [],
    };
  }

  const originCast = castsResult.rows[0];
  const windowMinutes = 180;
  const originTs = new Date(originCast.ts);

  const amplifiersResult = await pool.query(
    `select src_fid as fid, count(*) as engagements,
      min(ts) as first_ts
     from fc_edges
     where cast_hash = $1 and ts <= $2
     group by src_fid
     order by engagements desc
     limit 25`,
    [originCast.hash, new Date(originTs.getTime() + windowMinutes * 60000)],
  );

  const amplifierFids = amplifiersResult.rows.map((row) => Number(row.fid));
  const authorStatsMap = await loadAuthorStats(amplifierFids);

  const topAmplifiers = amplifiersResult.rows.map((row) => {
    const lagMinutes = Math.max(
      0,
      (new Date(row.first_ts).getTime() - originTs.getTime()) / 60000,
    );
    const author = authorStatsMap[row.fid] || defaultAuthorStats();
    const explain = computeScoreBreakdown({
      originLagMinutes: lagMinutes,
      engagement: {
        replies: 0,
        recasts: 0,
        reactions: 0,
        uniqueEngagers: Number(row.engagements),
        sustainedDays: 1,
        earlyEngagements: Number(row.engagements),
        earlyEngagers: Number(row.engagements),
      },
      author,
    });
    return {
      fid: row.fid,
      engagements: Number(row.engagements),
      score: explain.total,
      explain,
    };
  });

  const totals = await loadEngagementTotals(castsResult.rows.map((row) => row.hash));

  return {
    topic_id: topic.topic_id,
    normalized_query: topic.normalized_query,
    origin: originCast,
    window_minutes: windowMinutes,
    totals,
    top_amplifiers: topAmplifiers,
  };
});

server.get("/fid/:fid", async (request, reply) => {
  const { fid } = request.params as Record<string, string>;
  const fidNumber = Number(fid);
  if (!Number.isFinite(fidNumber)) {
    reply.code(400);
    return { error: "Invalid fid" };
  }

  const { data: user, error } = await supabase
    .from("fc_users")
    .select("fid, username, display_name, pfp_url, bio, updated_at")
    .eq("fid", fidNumber)
    .maybeSingle();

  if (error) {
    reply.code(500);
    return { error: "Failed to load user" };
  }

  const authorStatsMap = await loadAuthorStats([fidNumber]);
  const author = authorStatsMap[fidNumber] || defaultAuthorStats();

  const topics = await pool.query(
    `select t.topic_id, t.normalized_query, count(*) as events
     from topic_events e
     join topics t on t.topic_id = e.topic_id
     where e.fid = $1
     group by t.topic_id, t.normalized_query
     order by events desc
     limit 10`,
    [fidNumber],
  );

  return {
    profile: user,
    reputation: author,
    top_topics: topics.rows,
  };
});

server.get("/thread/:root_hash", async (request, reply) => {
  const { root_hash } = request.params as Record<string, string>;
  const rootResult = await pool.query(
    `select hash, fid, ts, text, parent_hash, root_parent_hash
     from fc_casts
     where hash = $1`,
    [root_hash],
  );

  if (rootResult.rows.length === 0) {
    reply.code(404);
    return { error: "Thread not found" };
  }

  const threadResult = await pool.query(
    `select hash, fid, ts, text, parent_hash, root_parent_hash
     from fc_casts
     where hash = $1 or root_parent_hash = $1 or parent_hash = $1
     order by ts asc`,
    [root_hash],
  );

  const participants = Array.from(
    new Set(threadResult.rows.map((row) => row.fid)),
  );

  const turningPoints = await pool.query(
    `select cast_hash, count(*) as replies
     from fc_edges
     where edge_type = 'reply' and cast_hash = any($1)
     group by cast_hash
     order by replies desc
     limit 3`,
    [threadResult.rows.map((row) => row.hash)],
  );

  return {
    root: rootResult.rows[0],
    casts: threadResult.rows,
    participants,
    turning_points: turningPoints.rows,
  };
});

server.setErrorHandler((error, _request, reply) => {
  reply.code(500).send({ error: error.message || "Internal error" });
});

const defaultEngagement = () => ({
  replies: 0,
  recasts: 0,
  reactions: 0,
  uniqueEngagers: 0,
  sustainedDays: 0,
  earlyEngagements: 0,
  earlyEngagers: 0,
});

const defaultAuthorStats = () => ({
  accountAgeDays: 0,
  followReciprocity: 0,
  repeatTextCount: 0,
  castCount: 0,
  replyRate: 0,
});

const loadEngagementTotals = async (castHashes: string[]) => {
  if (castHashes.length === 0) return defaultEngagement();
  const result = await pool.query(
    `select
      sum(case when edge_type = 'reply' then 1 else 0 end) as replies,
      sum(case when edge_type = 'recast' then 1 else 0 end) as recasts,
      sum(case when edge_type = 'reaction' then 1 else 0 end) as reactions,
      count(distinct src_fid) as unique_engagers,
      count(distinct date_trunc('day', ts)) as sustained_days
     from fc_edges
     where cast_hash = any($1)`,
    [castHashes],
  );

  const row = result.rows[0] || {};
  return {
    replies: Number(row.replies || 0),
    recasts: Number(row.recasts || 0),
    reactions: Number(row.reactions || 0),
    uniqueEngagers: Number(row.unique_engagers || 0),
    sustainedDays: Number(row.sustained_days || 0),
    earlyEngagements: 0,
    earlyEngagers: 0,
  };
};

const loadEngagementStats = async (castHashes: string[]) => {
  if (castHashes.length === 0) return {} as Record<string, ReturnType<typeof defaultEngagement>>;

  const result = await pool.query(
    `select e.cast_hash,
      sum(case when e.edge_type = 'reply' then 1 else 0 end) as replies,
      sum(case when e.edge_type = 'recast' then 1 else 0 end) as recasts,
      sum(case when e.edge_type = 'reaction' then 1 else 0 end) as reactions,
      count(distinct e.src_fid) as unique_engagers,
      count(distinct date_trunc('day', e.ts)) as sustained_days,
      sum(case when e.ts <= c.ts + interval '180 minutes' then 1 else 0 end) as early_engagements,
      count(distinct case when e.ts <= c.ts + interval '180 minutes' then e.src_fid end) as early_engagers
     from fc_edges e
     join fc_casts c on c.hash = e.cast_hash
     where e.cast_hash = any($1)
     group by e.cast_hash, c.ts`,
    [castHashes],
  );

  return result.rows.reduce((acc, row) => {
    acc[row.cast_hash] = {
      replies: Number(row.replies || 0),
      recasts: Number(row.recasts || 0),
      reactions: Number(row.reactions || 0),
      uniqueEngagers: Number(row.unique_engagers || 0),
      sustainedDays: Number(row.sustained_days || 0),
      earlyEngagements: Number(row.early_engagements || 0),
      earlyEngagers: Number(row.early_engagers || 0),
    };
    return acc;
  }, {} as Record<string, ReturnType<typeof defaultEngagement>>);
};

const loadAuthorStats = async (fids: number[]) => {
  if (fids.length === 0) return {} as Record<number, ReturnType<typeof defaultAuthorStats>>;

  const castStats = await pool.query(
    `select fid,
      count(*) filter (where deleted = false) as cast_count,
      count(*) filter (where parent_hash is not null and deleted = false) as reply_count,
      count(*) filter (where deleted = false) - count(distinct text) filter (where deleted = false) as repeat_text_count
     from fc_casts
     where fid = any($1)
     group by fid`,
    [fids],
  );

  const followers = await pool.query(
    `select dst_fid as fid, count(*) as followers
     from fc_edges
     where edge_type = 'follow' and dst_fid = any($1)
     group by dst_fid`,
    [fids],
  );

  const following = await pool.query(
    `select src_fid as fid, count(*) as following
     from fc_edges
     where edge_type = 'follow' and src_fid = any($1)
     group by src_fid`,
    [fids],
  );

  const firstSeen = await pool.query(
    `select fid, min(ts) as first_seen
     from fc_messages_raw
     where fid = any($1)
     group by fid`,
    [fids],
  );

  const map: Record<number, ReturnType<typeof defaultAuthorStats>> = {};
  const now = Date.now();

  for (const fid of fids) {
    map[fid] = defaultAuthorStats();
  }

  for (const row of castStats.rows) {
    map[row.fid] = {
      ...map[row.fid],
      castCount: Number(row.cast_count || 0),
      repeatTextCount: Number(row.repeat_text_count || 0),
      replyRate: row.cast_count ? Number(row.reply_count || 0) / Number(row.cast_count) : 0,
    };
  }

  const followersMap = new Map<number, number>();
  for (const row of followers.rows) {
    followersMap.set(Number(row.fid), Number(row.followers || 0));
  }

  const followingMap = new Map<number, number>();
  for (const row of following.rows) {
    followingMap.set(Number(row.fid), Number(row.following || 0));
  }

  for (const fid of fids) {
    const followersCount = followersMap.get(fid) ?? 0;
    const followingCount = followingMap.get(fid) ?? 0;
    map[fid] = {
      ...map[fid],
      followReciprocity: followingCount
        ? Math.min(1, followersCount / followingCount)
        : 0,
    };
  }

  for (const row of firstSeen.rows) {
    const ageDays = row.first_seen
      ? Math.max(0, (now - new Date(row.first_seen).getTime()) / 86400000)
      : 0;
    map[row.fid] = {
      ...map[row.fid],
      accountAgeDays: ageDays,
    };
  }

  return map;
};

const aggregateTopFids = (items: Array<{ fid: number; score: number }>) => {
  const map = new Map<number, { fid: number; score: number; count: number }>();
  for (const item of items) {
    const existing = map.get(item.fid);
    if (existing) {
      existing.score += item.score;
      existing.count += 1;
    } else {
      map.set(item.fid, { fid: item.fid, score: item.score, count: 1 });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};

const port = Number(process.env.PORT || process.env.API_PORT || 4000);

const start = async () => {
  try {
    pool = getPool();
    supabase = getSupabaseServiceClient();
  } catch (error) {
    log.error("startup_config_error", {
      error: error instanceof Error ? error.message : String(error),
      hint: "Set DATABASE_URL (local) or SUPABASE_DB_URL (remote) in apps/api/.env",
    });
    process.exit(1);
  }

  try {
    await pool.query("select 1 as ok");
    log.info("db_connected", { ok: true });
  } catch (error) {
    log.error("db_connect_failed", {
      error: error instanceof Error ? error.message : String(error),
      hint:
        "Check SUPABASE_DB_URL/DATABASE_URL. The host should look like db.<project-ref>.supabase.co (not just .supabase.co).",
    });
    process.exit(1);
  }

  try {
    await server.listen({ port, host: "0.0.0.0" });
    log.info("api_listening", { port });
  } catch (error) {
    log.error("api_listen_failed", {
      port,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason) => {
  log.error("unhandled_rejection", { reason: String(reason) });
});

process.on("uncaughtException", (error) => {
  log.error("uncaught_exception", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

start();
