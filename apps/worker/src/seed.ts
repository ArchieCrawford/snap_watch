import "dotenv/config";
import { backfillEvents, createLogger, ingestEvent } from "./ingest";

const log = createLogger();

const config = {
  hubUrl: process.env.SEED_HUB_URL || process.env.HUB_RPC_URL || "",
  insecure: process.env.HUB_RPC_INSECURE === "true",
  username: process.env.HUB_RPC_USERNAME,
  password: process.env.HUB_RPC_PASSWORD,
  authToken: process.env.HUB_RPC_AUTH_TOKEN,
  backfillDays: Number(process.env.SEED_BACKFILL_DAYS || 1),
  cursorPath: process.env.INGEST_CURSOR_PATH || "apps/worker/.data/cursor.json",
};

if (!config.hubUrl) {
  log("error", "missing_hub_url", { hint: "Set SEED_HUB_URL or HUB_RPC_URL" });
  process.exit(1);
}

const main = async () => {
  log("info", "seed_start", { backfillDays: config.backfillDays });
  await backfillEvents(config, log, async (event) => {
    await ingestEvent(event, log);
  });
};

main().catch((error) => {
  log("error", "seed_crash", { error: error.message });
  process.exit(1);
});
