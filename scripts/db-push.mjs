import { spawnSync } from "node:child_process";

const result = spawnSync("supabase", ["db", "push"], { stdio: "inherit" });
process.exit(result.status ?? 1);
