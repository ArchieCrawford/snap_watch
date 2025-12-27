import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

let pool: Pool | null = null;

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
    pool = new Pool({ connectionString: resolveDbUrl() });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool());
}
