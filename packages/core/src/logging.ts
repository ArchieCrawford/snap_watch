import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
};

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const normalizeLevel = (value: unknown): LogLevel => {
  const raw = String(value || "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
};

const redactKeys = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "HUB_RPC_PASSWORD",
  "HUB_RPC_AUTH_TOKEN",
]);

const redactObject = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactObject);

  const obj = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    next[key] = redactKeys.has(key) ? "[REDACTED]" : redactObject(val);
  }
  return next;
};

/**
 * Best-effort repo root lookup so logs always land in the monorepo root.
 * We look for pnpm-workspace.yaml and fall back to the start directory.
 */
export const findRepoRoot = (startDir = process.cwd()): string => {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
};

export const ensureLogDir = (repoRoot = findRepoRoot()): string => {
  const logDir = path.join(repoRoot, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  return logDir;
};

const openLogStream = (service: string) => {
  const logDir = ensureLogDir();
  const filePath = path.join(logDir, `${service}.log`);
  return fs.createWriteStream(filePath, { flags: "a" });
};

/**
 * Minimal JSON logger that writes to stdout + logs/<service>.log.
 *
 * - Structured JSON lines (good for grep + tooling)
 * - Redacts common secrets
 * - Ensures the repo-root logs/ directory exists
 */
export const createServiceLogger = (service: string, opts?: { level?: LogLevel }): Logger => {
  const minLevel = opts?.level ?? normalizeLevel(process.env.LOG_LEVEL);
  const minValue = levelOrder[minLevel];

  const stream = openLogStream(service);

  const write = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (levelOrder[level] < minValue) return;

    const payload = {
      level,
      service,
      msg,
      ts: new Date().toISOString(),
      ...(data ? (redactObject(data) as Record<string, unknown>) : {}),
    };

    const line = `${JSON.stringify(payload)}\n`;
    try {
      // stdout for interactive dev
      process.stdout.write(line);
    } catch {
      // ignore
    }

    try {
      stream.write(line);
    } catch {
      // ignore
    }
  };

  return {
    debug: (msg, data) => write("debug", msg, data),
    info: (msg, data) => write("info", msg, data),
    warn: (msg, data) => write("warn", msg, data),
    error: (msg, data) => write("error", msg, data),
  };
};
