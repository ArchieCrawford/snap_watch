import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import dns from "node:dns";

let pool: Pool | null = null;

// Render (and some other hosts) may not have IPv6 egress, while Supabase DNS can
// return AAAA records. Prefer IPv4 to avoid ENETUNREACH on connect.
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Older Node versions may not support this; safe to ignore.
}

function resolveDbUrl() {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing SUPABASE_DB_URL or DATABASE_URL for direct Postgres access",
    );
  }
  return url;
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDbUrl(),
      family: 4,
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool());
}
