import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const edgeTypeEnum = pgEnum("edge_type", [
  "follow",
  "reaction",
  "reply",
  "recast",
]);

export const topicEventKindEnum = pgEnum("topic_event_kind", [
  "cast",
  "reply",
  "recast",
  "reaction",
]);

export const fcMessagesRaw = pgTable(
  "fc_messages_raw",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    fid: bigint("fid", { mode: "number" }).notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    hash: text("hash").notNull(),
    parentHash: text("parent_hash"),
    rootParentHash: text("root_parent_hash"),
    canonicalUrl: text("canonical_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    hashIdx: index("fc_messages_raw_hash_idx").on(table.hash),
    tsIdx: index("fc_messages_raw_ts_idx").on(table.ts),
    fidTsIdx: index("fc_messages_raw_fid_ts_idx").on(table.fid, table.ts),
    parentHashIdx: index("fc_messages_raw_parent_hash_idx").on(
      table.parentHash,
    ),
    rootParentHashIdx: index("fc_messages_raw_root_parent_hash_idx").on(
      table.rootParentHash,
    ),
  }),
);

export const fcUsers = pgTable(
  "fc_users",
  {
    fid: bigint("fid", { mode: "number" }).primaryKey(),
    username: text("username"),
    displayName: text("display_name"),
    pfpUrl: text("pfp_url"),
    bio: text("bio"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    usernameIdx: index("fc_users_username_trgm_idx").on(table.username),
    displayNameIdx: index("fc_users_display_name_trgm_idx").on(
      table.displayName,
    ),
  }),
);

export const fcEdges = pgTable(
  "fc_edges",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    srcFid: bigint("src_fid", { mode: "number" }).notNull(),
    dstFid: bigint("dst_fid", { mode: "number" }).notNull(),
    edgeType: edgeTypeEnum("edge_type").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    weight: real("weight").notNull().default(1),
    castHash: text("cast_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tsIdx: index("fc_edges_ts_idx").on(table.ts),
    srcTsIdx: index("fc_edges_src_ts_idx").on(table.srcFid, table.ts),
    dstTsIdx: index("fc_edges_dst_ts_idx").on(table.dstFid, table.ts),
    typeTsIdx: index("fc_edges_type_ts_idx").on(table.edgeType, table.ts),
    castHashIdx: index("fc_edges_cast_hash_idx").on(table.castHash),
  }),
);

export const fcCasts = pgTable(
  "fc_casts",
  {
    hash: text("hash").primaryKey(),
    fid: bigint("fid", { mode: "number" }).notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    text: text("text").notNull(),
    parentHash: text("parent_hash"),
    rootParentHash: text("root_parent_hash"),
    mentions: jsonb("mentions"),
    embeds: jsonb("embeds"),
    deleted: boolean("deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tsIdx: index("fc_casts_ts_idx").on(table.ts),
    fidTsIdx: index("fc_casts_fid_ts_idx").on(table.fid, table.ts),
    parentHashIdx: index("fc_casts_parent_hash_idx").on(table.parentHash),
    rootParentHashIdx: index("fc_casts_root_parent_hash_idx").on(
      table.rootParentHash,
    ),
  }),
);

export const topics = pgTable("topics", {
  topicId: bigserial("topic_id", { mode: "number" }).primaryKey(),
  normalizedQuery: text("normalized_query").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const topicEvents = pgTable(
  "topic_events",
  {
    topicId: bigint("topic_id", { mode: "number" }).notNull(),
    eventId: text("event_id").notNull(),
    fid: bigint("fid", { mode: "number" }).notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    kind: topicEventKindEnum("kind").notNull(),
    castHash: text("cast_hash"),
    scoreComponents: jsonb("score_components").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    topicTsIdx: index("topic_events_topic_ts_idx").on(table.topicId, table.ts),
    fidTsIdx: index("topic_events_fid_ts_idx").on(table.fid, table.ts),
  }),
);

export const scoresDaily = pgTable(
  "scores_daily",
  {
    day: date("day").notNull(),
    fid: bigint("fid", { mode: "number" }).notNull(),
    topicId: bigint("topic_id", { mode: "number" }),
    originScore: numeric("origin_score").notNull().default("0"),
    amplifierScore: numeric("amplifier_score").notNull().default("0"),
    signalScore: numeric("signal_score").notNull().default("0"),
    totalScore: numeric("total_score").notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    fidDayIdx: index("scores_daily_fid_day_idx").on(table.fid, table.day),
    topicDayIdx: index("scores_daily_topic_day_idx").on(
      table.topicId,
      table.day,
    ),
  }),
);
