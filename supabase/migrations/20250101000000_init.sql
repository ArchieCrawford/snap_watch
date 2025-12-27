-- Extensions
create extension if not exists pg_trgm;

-- Enums
create type edge_type as enum ('follow', 'reaction', 'reply', 'recast');
create type topic_event_kind as enum ('cast', 'reply', 'recast', 'reaction');

-- Raw messages
create table if not exists fc_messages_raw (
  id bigserial primary key,
  ts timestamptz not null,
  fid bigint not null,
  type text not null,
  payload jsonb not null,
  hash text not null unique,
  parent_hash text,
  root_parent_hash text,
  canonical_url text,
  created_at timestamptz not null default now()
);

create index if not exists fc_messages_raw_ts_idx on fc_messages_raw (ts);
create index if not exists fc_messages_raw_fid_ts_idx on fc_messages_raw (fid, ts);
create index if not exists fc_messages_raw_type_ts_idx on fc_messages_raw (type, ts);
create index if not exists fc_messages_raw_parent_hash_idx on fc_messages_raw (parent_hash);
create index if not exists fc_messages_raw_root_parent_hash_idx on fc_messages_raw (root_parent_hash);

-- Users
create table if not exists fc_users (
  fid bigint primary key,
  username text,
  display_name text,
  pfp_url text,
  bio text,
  updated_at timestamptz not null default now()
);

create index if not exists fc_users_username_trgm_idx on fc_users using gin (username gin_trgm_ops);
create index if not exists fc_users_display_name_trgm_idx on fc_users using gin (display_name gin_trgm_ops);

-- Edges
create table if not exists fc_edges (
  id bigserial primary key,
  src_fid bigint not null,
  dst_fid bigint not null,
  edge_type edge_type not null,
  ts timestamptz not null,
  weight real not null default 1,
  cast_hash text,
  created_at timestamptz not null default now()
);

create index if not exists fc_edges_ts_idx on fc_edges (ts);
create index if not exists fc_edges_src_ts_idx on fc_edges (src_fid, ts);
create index if not exists fc_edges_dst_ts_idx on fc_edges (dst_fid, ts);
create index if not exists fc_edges_type_ts_idx on fc_edges (edge_type, ts);
create index if not exists fc_edges_cast_hash_idx on fc_edges (cast_hash);
create unique index if not exists fc_edges_dedupe_idx
  on fc_edges (src_fid, dst_fid, edge_type, (coalesce(cast_hash, '')), ts);

-- Casts
create table if not exists fc_casts (
  hash text primary key,
  fid bigint not null,
  ts timestamptz not null,
  text text not null,
  text_tsv tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored,
  parent_hash text,
  root_parent_hash text,
  mentions jsonb,
  embeds jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists fc_casts_ts_idx on fc_casts (ts);
create index if not exists fc_casts_fid_ts_idx on fc_casts (fid, ts);
create index if not exists fc_casts_parent_hash_idx on fc_casts (parent_hash);
create index if not exists fc_casts_root_parent_hash_idx on fc_casts (root_parent_hash);
create index if not exists fc_casts_text_tsv_idx on fc_casts using gin (text_tsv);
create index if not exists fc_casts_text_trgm_idx on fc_casts using gin (text gin_trgm_ops);

-- Topics
create table if not exists topics (
  topic_id bigserial primary key,
  normalized_query text not null unique,
  created_at timestamptz not null default now()
);

-- Topic events
create table if not exists topic_events (
  topic_id bigint not null references topics(topic_id) on delete cascade,
  event_id text not null,
  fid bigint not null,
  ts timestamptz not null,
  kind topic_event_kind not null,
  cast_hash text,
  score_components jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (topic_id, event_id)
);

create index if not exists topic_events_topic_ts_idx on topic_events (topic_id, ts);
create index if not exists topic_events_fid_ts_idx on topic_events (fid, ts);

-- Scores (daily)
create table if not exists scores_daily (
  day date not null,
  fid bigint not null,
  topic_id bigint references topics(topic_id) on delete set null,
  origin_score numeric not null default 0,
  amplifier_score numeric not null default 0,
  signal_score numeric not null default 0,
  total_score numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (day, fid, topic_id)
);

create index if not exists scores_daily_fid_day_idx on scores_daily (fid, day);
create index if not exists scores_daily_topic_day_idx on scores_daily (topic_id, day);

-- RLS
alter table fc_messages_raw enable row level security;
alter table fc_users enable row level security;
alter table fc_edges enable row level security;
alter table fc_casts enable row level security;
alter table topics enable row level security;
alter table topic_events enable row level security;
alter table scores_daily enable row level security;

-- Public read policies
create policy "public read casts" on fc_casts
  for select using (true);

create policy "public read users" on fc_users
  for select using (true);

create policy "public read topics" on topics
  for select using (true);

create policy "public read topic events" on topic_events
  for select using (true);

create policy "public read scores" on scores_daily
  for select using (true);
