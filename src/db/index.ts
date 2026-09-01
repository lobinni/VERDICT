import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy database client. The connection pool is created on first use — never
 * at module import time — so production builds (e.g. Vercel) succeed even
 * before DATABASE_URL is configured, and every consumer sees a single clear
 * error message when it is missing.
 *
 * Connection defaults are friendly to hosted PostgreSQL such as Supabase:
 * SSL is enabled automatically for remote hosts (Supabase requires it),
 * unless the connection string carries its own `sslmode` directive, and the
 * pool is kept small with explicit timeouts for serverless runtimes.
 */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is required to use the indexer database");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** True when every database problem, configured or connectivity, occurred. */
export function isDatabaseError(err: unknown): boolean {
  if (err instanceof DatabaseNotConfiguredError) return true;
  if (!(err instanceof Error)) return false;
  const code = String((err as NodeJS.ErrnoException).code ?? "");
  return (
    CONNECTION_ERROR_PATTERN.test(err.message) || CONNECTION_ERROR_PATTERN.test(code)
  );
}

const CONNECTION_ERROR_PATTERN =
  /ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|EPIPE|ETIMEDOUT|connection terminated|connection timeout|timeout exceeded|self signed certificate|certificate|ssl|secure connection|no pg_hba|remaining connection slots|socket hang up|does not exist|authentication failed|password authentication/i;

type Client = { pool: Pool; db: NodePgDatabase<Record<string, never>> };

const globalForDb = globalThis as typeof globalThis & { __verdictDbClient?: Client };

/** Remote hosts get SSL by default; an explicit sslmode in the URL wins. */
function useSsl(databaseUrl: string): boolean {
  if (/sslmode=/i.test(databaseUrl)) return false;
  return !/(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl);
}

function createClient(): Client {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new DatabaseNotConfiguredError();
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(useSsl(databaseUrl) ? { ssl: { rejectUnauthorized: false } } : {}),
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  return { pool, db: drizzle(pool) };
}

function client(): Client {
  if (!globalForDb.__verdictDbClient) {
    globalForDb.__verdictDbClient = createClient();
  }
  return globalForDb.__verdictDbClient;
}

function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const target = resolve() as unknown as Record<string | symbol, unknown>;
      const value = target[prop];
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

export const pool = lazy(() => client().pool);
export const db = lazy(() => client().db);
