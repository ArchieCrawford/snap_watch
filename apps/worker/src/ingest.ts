import {
  HubEvent,
  HubEventType,
  Message,
  MessageType,
  ReactionType,
  UserDataType,
  bytesToHexString,
  fromFarcasterTime,
  getAuthMetadata,
  getInsecureHubRpcClient,
  getSSLHubRpcClient,
  makeEventId,
} from "@farcaster/hub-nodejs";
import { Metadata } from "@grpc/grpc-js";
import { getPool } from "@snapsearch/db";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type IngestConfig = {
  hubUrl: string;
  insecure: boolean;
  username?: string;
  password?: string;
  authToken?: string;
  backfillDays: number;
  cursorPath: string;
};

type Logger = (level: "info" | "warn" | "error", msg: string, data?: Record<string, unknown>) => void;

const toHex = (bytes?: Uint8Array | null) => {
  if (!bytes) return null;
  const result = bytesToHexString(bytes);
  if (result.isOk?.()) {
    return result.value;
  }
  return null;
};

const toDate = (timestamp: number) => {
  const result = fromFarcasterTime(timestamp);
  if (result.isOk?.()) {
    return new Date(result.value);
  }
  return new Date();
};

const buildMetadata = (config: IngestConfig) => {
  if (config.username && config.password) {
    return getAuthMetadata(config.username, config.password);
  }

  if (config.authToken) {
    const metadata = new Metadata();
    metadata.set("authorization", `Bearer ${config.authToken}`);
    return metadata;
  }

  return undefined;
};

export const createHubClient = (config: IngestConfig) => {
  return config.insecure
    ? getInsecureHubRpcClient(config.hubUrl)
    : getSSLHubRpcClient(config.hubUrl);
};

export const waitForHub = async (client: ReturnType<typeof createHubClient>) => {
  const timeoutMsRaw = process.env.HUB_RPC_CONNECT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(Number(timeoutMsRaw))
    ? Number(timeoutMsRaw)
    : 20000;

  return new Promise<void>((resolve, reject) => {
    client.$.waitForReady(Date.now() + timeoutMs, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

const insertRawMessage = async (
  hash: string,
  fid: number,
  ts: Date,
  type: string,
  payload: Record<string, unknown>,
  parentHash: string | null,
  rootParentHash: string | null,
  canonicalUrl: string | null,
) => {
  const pool = getPool();
  const result = await pool.query(
    `insert into fc_messages_raw
      (hash, fid, ts, type, payload, parent_hash, root_parent_hash, canonical_url)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (hash) do nothing`,
    [
      hash,
      fid,
      ts.toISOString(),
      type,
      payload,
      parentHash,
      rootParentHash,
      canonicalUrl,
    ],
  );
  return result.rowCount > 0;
};

const ensureUser = async (fid: number) => {
  const pool = getPool();
  await pool.query(
    `insert into fc_users (fid) values ($1) on conflict (fid) do nothing`,
    [fid],
  );
};

const upsertUserData = async (
  fid: number,
  data: Partial<{ username: string; display_name: string; pfp_url: string; bio: string }>,
) => {
  const pool = getPool();
  await pool.query(
    `insert into fc_users (fid, username, display_name, pfp_url, bio, updated_at)
      values ($1, $2, $3, $4, $5, now())
      on conflict (fid) do update set
        username = coalesce(excluded.username, fc_users.username),
        display_name = coalesce(excluded.display_name, fc_users.display_name),
        pfp_url = coalesce(excluded.pfp_url, fc_users.pfp_url),
        bio = coalesce(excluded.bio, fc_users.bio),
        updated_at = now()`,
    [fid, data.username ?? null, data.display_name ?? null, data.pfp_url ?? null, data.bio ?? null],
  );
};

const resolveRootParentHash = async (parentHash: string | null) => {
  if (!parentHash) return null;
  const pool = getPool();
  const result = await pool.query(
    `select root_parent_hash from fc_casts where hash = $1 limit 1`,
    [parentHash],
  );
  if (result.rows.length > 0) {
    return result.rows[0].root_parent_hash || parentHash;
  }
  return parentHash;
};

const upsertCast = async (
  hash: string,
  fid: number,
  ts: Date,
  text: string,
  parentHash: string | null,
  rootParentHash: string | null,
  mentions: number[],
  embeds: Array<Record<string, unknown>>,
) => {
  const pool = getPool();
  await pool.query(
    `insert into fc_casts
      (hash, fid, ts, text, parent_hash, root_parent_hash, mentions, embeds, deleted)
      values ($1, $2, $3, $4, $5, $6, $7, $8, false)
      on conflict (hash) do update set
        fid = excluded.fid,
        ts = excluded.ts,
        text = excluded.text,
        parent_hash = excluded.parent_hash,
        root_parent_hash = excluded.root_parent_hash,
        mentions = excluded.mentions,
        embeds = excluded.embeds,
        deleted = false`,
    [
      hash,
      fid,
      ts.toISOString(),
      text,
      parentHash,
      rootParentHash,
      JSON.stringify(mentions),
      JSON.stringify(embeds),
    ],
  );
};

const markCastDeleted = async (hash: string) => {
  const pool = getPool();
  await pool.query(`update fc_casts set deleted = true where hash = $1`, [hash]);
};

const insertEdge = async (
  srcFid: number,
  dstFid: number,
  edgeType: "follow" | "reaction" | "reply" | "recast",
  ts: Date,
  castHash: string | null,
) => {
  const pool = getPool();
  await pool.query(
    `insert into fc_edges (src_fid, dst_fid, edge_type, ts, weight, cast_hash)
      values ($1, $2, $3, $4, 1, $5)
      on conflict do nothing`,
    [srcFid, dstFid, edgeType, ts.toISOString(), castHash],
  );
};

const deleteEdge = async (
  srcFid: number,
  dstFid: number,
  edgeType: "follow" | "reaction" | "reply" | "recast",
  castHash: string | null,
) => {
  const pool = getPool();
  await pool.query(
    `delete from fc_edges
      where src_fid = $1 and dst_fid = $2 and edge_type = $3 and ($4::text is null or cast_hash = $4)`,
    [srcFid, dstFid, edgeType, castHash],
  );
};

const processMessage = async (
  message: Message,
  log: Logger,
  options: { isDeleteEvent: boolean },
) => {
  if (!message.data) return;
  const data = message.data;
  const hash = toHex(message.hash);
  if (!hash) return;

  const fid = data.fid;
  const ts = toDate(data.timestamp);
  const typeLabel = MessageType[data.type] ?? "UNKNOWN";
  const payload = Message.toJSON(message) as Record<string, unknown>;

  let parentHash: string | null = null;
  let rootParentHash: string | null = null;
  let canonicalUrl: string | null = null;

  if (data.castAddBody?.parentCastId?.hash) {
    parentHash = toHex(data.castAddBody.parentCastId.hash);
    rootParentHash = await resolveRootParentHash(parentHash);
  }

  if (data.castAddBody?.parentUrl) {
    canonicalUrl = data.castAddBody.parentUrl;
  }

  const inserted = await insertRawMessage(
    hash,
    fid,
    ts,
    typeLabel,
    payload,
    parentHash,
    rootParentHash,
    canonicalUrl,
  );
  if (!inserted && !options.isDeleteEvent) {
    return;
  }

  await ensureUser(fid);

  switch (data.type) {
    case MessageType.CAST_ADD: {
      if (options.isDeleteEvent) {
        await markCastDeleted(hash);
        break;
      }
      const body = data.castAddBody;
      if (!body) return;
      const embeds = (body.embeds || [])
        .map((embed) => {
          if (embed.url) return { url: embed.url };
          if (embed.castId) {
            return {
              fid: embed.castId.fid,
              hash: toHex(embed.castId.hash),
            };
          }
          return null;
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      await upsertCast(
        hash,
        fid,
        ts,
        body.text,
        parentHash,
        rootParentHash,
        body.mentions || [],
        embeds,
      );

      if (body.parentCastId?.fid) {
        await insertEdge(
          fid,
          body.parentCastId.fid,
          "reply",
          ts,
          parentHash,
        );
      }
      break;
    }
    case MessageType.CAST_REMOVE: {
      const targetHash = toHex(data.castRemoveBody?.targetHash || null);
      if (targetHash) {
        await markCastDeleted(targetHash);
      }
      break;
    }
    case MessageType.REACTION_ADD: {
      const reaction = data.reactionBody;
      const target = reaction?.targetCastId;
      if (!reaction || !target || !target.fid) return;
      const castHash = toHex(target.hash);
      const edgeType =
        reaction.type === ReactionType.RECAST ? "recast" : "reaction";
      if (options.isDeleteEvent) {
        await deleteEdge(fid, target.fid, edgeType, castHash);
      } else {
        await insertEdge(fid, target.fid, edgeType, ts, castHash);
      }
      break;
    }
    case MessageType.REACTION_REMOVE: {
      const reaction = data.reactionBody;
      const target = reaction?.targetCastId;
      if (!reaction || !target || !target.fid) return;
      const castHash = toHex(target.hash);
      const edgeType =
        reaction.type === ReactionType.RECAST ? "recast" : "reaction";
      await deleteEdge(fid, target.fid, edgeType, castHash);
      break;
    }
    case MessageType.LINK_ADD: {
      const link = data.linkBody;
      if (!link || link.type !== "follow" || !link.targetFid) return;
      if (options.isDeleteEvent) {
        await deleteEdge(fid, link.targetFid, "follow", null);
      } else {
        await insertEdge(fid, link.targetFid, "follow", ts, null);
      }
      break;
    }
    case MessageType.LINK_REMOVE: {
      const link = data.linkBody;
      if (!link || link.type !== "follow" || !link.targetFid) return;
      await deleteEdge(fid, link.targetFid, "follow", null);
      break;
    }
    case MessageType.USER_DATA_ADD: {
      const userData = data.userDataBody;
      if (!userData) return;
      if (userData.type === UserDataType.USERNAME) {
        await upsertUserData(fid, { username: userData.value });
      } else if (userData.type === UserDataType.DISPLAY) {
        await upsertUserData(fid, { display_name: userData.value });
      } else if (userData.type === UserDataType.PFP) {
        await upsertUserData(fid, { pfp_url: userData.value });
      } else if (userData.type === UserDataType.BIO) {
        await upsertUserData(fid, { bio: userData.value });
      }
      break;
    }
    default:
      break;
  }

};

const extractMessageFromEvent = (event: HubEvent) => {
  if (event.mergeMessageBody?.message) return event.mergeMessageBody.message;
  if (event.pruneMessageBody?.message) return event.pruneMessageBody.message;
  if (event.revokeMessageBody?.message) return event.revokeMessageBody.message;
  return undefined;
};

export const backfillEvents = async (
  config: IngestConfig,
  log: Logger,
  onEvent: (event: HubEvent) => Promise<void>,
) => {
  const client = createHubClient(config);
  const metadata = buildMetadata(config);
  await waitForHub(client);

  const startTime = Date.now() - config.backfillDays * 24 * 60 * 60 * 1000;
  const startId = makeEventId(startTime, 0);
  let pageToken: Uint8Array | undefined;
  let total = 0;

  while (true) {
    const result = await client.getEvents(
      {
        startId,
        pageSize: 1000,
        pageToken,
      },
      metadata,
    );

    if (!result.isOk?.()) {
      log("error", "backfill_failed", { error: result.error?.message });
      break;
    }

    const response = result.value;
    for (const event of response.events) {
      await onEvent(event);
      total += 1;
    }

    if (!response.nextPageToken || response.nextPageToken.length === 0) {
      break;
    }
    pageToken = response.nextPageToken;
  }

  client.close();
  log("info", "backfill_complete", { total });
};

export const streamEvents = async (
  config: IngestConfig,
  log: Logger,
  fromId: number,
  onEvent: (event: HubEvent) => Promise<void>,
) => {
  const client = createHubClient(config);
  const metadata = buildMetadata(config);
  await waitForHub(client);

  const result = await client.subscribe(
    {
      eventTypes: [
        HubEventType.MERGE_MESSAGE,
        HubEventType.PRUNE_MESSAGE,
        HubEventType.REVOKE_MESSAGE,
      ],
      fromId,
    },
    metadata,
  );

  if (!result.isOk?.()) {
    log("error", "subscribe_failed", { error: result.error?.message });
    client.close();
    return;
  }

  const stream = result.value;
  stream.on("data", (event: HubEvent) => {
    onEvent(event).catch((error) => {
      log("error", "stream_event_failed", { error: error.message });
    });
  });

  return await new Promise<void>((resolve) => {
    stream.on("error", (error: Error) => {
      log("error", "stream_error", { error: error.message });
      resolve();
    });

    stream.on("end", () => {
      log("warn", "stream_ended");
      resolve();
    });
  });
};

export const ingestEvent = async (event: HubEvent, log: Logger) => {
  const message = extractMessageFromEvent(event);
  if (!message) return;
  const isDeleteEvent =
    event.type === HubEventType.PRUNE_MESSAGE ||
    event.type === HubEventType.REVOKE_MESSAGE;
  await processMessage(message, log, { isDeleteEvent });
};

export const readCursor = async (path: string) => {
  try {
    const data = await readFile(path, "utf-8");
    const parsed = JSON.parse(data) as { lastEventId?: number };
    if (typeof parsed.lastEventId === "number") {
      return parsed.lastEventId;
    }
  } catch {
    return 0;
  }
  return 0;
};

export const writeCursor = async (path: string, lastEventId: number) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ lastEventId }), "utf-8");
};
