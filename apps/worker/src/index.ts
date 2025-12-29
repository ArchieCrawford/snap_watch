import "dotenv/config";
import { createServiceLogger } from "@snapsearch/core";
import {
  backfillEvents,
  ingestEvent,
  readCursor,
  streamEvents,
  writeCursor,
} from "./ingest";

const baseLog = createServiceLogger("worker");
const log = (level: "info" | "warn" | "error", msg: string, data?: Record<string, unknown>) => {
  baseLog[level](msg, data);
};

const config = {
  hubUrl: process.env.HUB_RPC_URL || "",
  insecure: process.env.HUB_RPC_INSECURE === "true",
  username: process.env.HUB_RPC_USERNAME,
  password: process.env.HUB_RPC_PASSWORD,
  authToken: process.env.HUB_RPC_AUTH_TOKEN,
  backfillDays: Number(process.env.HUB_BACKFILL_DAYS || 3),
  cursorPath: process.env.INGEST_CURSOR_PATH || "apps/worker/.data/cursor.json",
};

if (!config.hubUrl) {
  log("error", "missing_hub_url", { hint: "Set HUB_RPC_URL" });
  process.exit(1);
}

const main = async () => {
  let lastEventId = await readCursor(config.cursorPath);
  log("info", "ingest_start", { lastEventId, backfillDays: config.backfillDays });

  while (true) {
    try {
      await backfillEvents(config, log, async (event) => {
        await ingestEvent(event, log);
        lastEventId = event.id;
        await writeCursor(config.cursorPath, lastEventId);
      });
      break;
    } catch (error) {
      log("error", "backfill_crash", {
        error: error instanceof Error ? error.message : String(error),
        hint: "Check HUB_RPC_URL and set HUB_RPC_INSECURE=true if your hub endpoint is not TLS.",
      });
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  while (true) {
    const fromId = lastEventId ? lastEventId + 1 : 0;
    log("info", "stream_start", { fromId });
    try {
      await streamEvents(config, log, fromId, async (event) => {
        await ingestEvent(event, log);
        lastEventId = event.id;
        await writeCursor(config.cursorPath, lastEventId);
      });
    } catch (error) {
      log("error", "stream_crash", {
        error: error instanceof Error ? error.message : String(error),
        hint: "Hub connection dropped or was unreachable; will retry.",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
};

main().catch((error) => {
  log("error", "ingest_crash", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("error", "unhandled_rejection", { reason: String(reason) });
});

process.on("uncaughtException", (error) => {
  log("error", "uncaught_exception", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
