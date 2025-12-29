import { spawn, spawnSync } from "node:child_process";

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
const hubUrl = process.env.HUB_RPC_URL || "";

const strictDev = ["1", "true", "yes"].includes(
  String(process.env.STRICT_DEV || "").toLowerCase(),
);
const looksLocal =
  dbUrl.includes("localhost") ||
  dbUrl.includes("127.0.0.1") ||
  dbUrl.includes("snapsearch-postgres");
const useLocalDb =
  ["1", "true", "yes"].includes(String(process.env.USE_LOCAL_DB || "").toLowerCase()) ||
  looksLocal;

const canStartApi = Boolean(dbUrl);
const canStartWorker = Boolean(dbUrl && hubUrl);

if (useLocalDb && (canStartApi || canStartWorker)) {
  const result = spawnSync("docker", ["compose", "up", "-d"], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} else {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "Using remote Supabase; set USE_LOCAL_DB=1 to start local Postgres",
    }),
  );
}

if (!canStartApi) {
  console.log(
    JSON.stringify({
      level: "warn",
      msg: "Skipping api: missing SUPABASE_DB_URL/DATABASE_URL",
    }),
  );
}

if (!canStartWorker) {
  console.log(
    JSON.stringify({
      level: "warn",
      msg: "Skipping worker: missing HUB_RPC_URL and/or SUPABASE_DB_URL/DATABASE_URL",
    }),
  );
}

const procs = [];

const spawnDev = (filter) => {
  const child = spawn(pnpmCmd, ["--filter", filter, "dev"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => {
    const exitCode = code ?? 0;
    if (exitCode !== 0) {
      console.log(
        JSON.stringify({
          level: "error",
          msg: "dev_process_exit",
          filter,
          code: exitCode,
          strictDev,
        }),
      );
      if (strictDev) {
        process.exit(exitCode);
      }
    }
  });

  procs.push(child);
  return child;
};

spawnDev("@snapsearch/web");
if (canStartApi) spawnDev("@snapsearch/api");
if (canStartWorker) spawnDev("@snapsearch/worker");

const killAll = (signal) => {
  for (const proc of procs) {
    try {
      proc.kill(signal);
    } catch {
      // ignore
    }
  }
};

process.on("SIGINT", () => killAll("SIGINT"));
process.on("SIGTERM", () => killAll("SIGTERM"));
