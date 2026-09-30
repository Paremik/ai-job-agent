import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export class DatabaseConfigError extends Error {}

export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL?.trim();
  if (!value) throw new DatabaseConfigError("Add DATABASE_URL to your local .env file first.");
  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    ) {
      throw new Error("Invalid PostgreSQL URL");
    }
  } catch {
    // Never expose a connection string or password in errors.
    throw new DatabaseConfigError(
      "DATABASE_URL must be a PostgreSQL connection string with a host and database name.",
    );
  }
  return value;
}

export function createDatabase(env: NodeJS.ProcessEnv = process.env) {
  const pool = new pg.Pool({
    connectionString: readDatabaseUrl(env),
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
  pool.on("error", () => {
    console.error("An idle database connection failed. Connection details are omitted.");
  });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
