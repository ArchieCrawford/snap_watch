import { spawn, spawnSync } from "node:child_process";

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
const looksLocal =
  dbUrl.includes("localhost") ||
  dbUrl.includes("127.0.0.1") ||
  dbUrl.includes("snapsearch-postgres");
const useLocalDb =
  ["1", "true", "yes"].includes(String(process.env.USE_LOCAL_DB || "").toLowerCase()) ||
  looksLocal;

if (useLocalDb) {
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

const child = spawn(
  pnpmCmd,
  ["-r", "--parallel", "--filter", "./apps/*", "dev"],
  {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
