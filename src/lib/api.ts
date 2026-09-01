import { DatabaseNotConfiguredError, isDatabaseError } from "@/db";
import { EngineError } from "./engine";

export function jsonError(err: unknown): Response {
  if (err instanceof EngineError) {
    return Response.json({ error: err.message, code: err.code }, { status: 400 });
  }
  if (err instanceof DatabaseNotConfiguredError) {
    return Response.json(
      { error: "The indexer database is not configured yet. Set DATABASE_URL and run the schema push.", code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (isDatabaseError(err)) {
    return Response.json(
      {
        error: "The database connection failed. Check DATABASE_URL — on Supabase use the session pooler string with ?sslmode=require — then redeploy.",
        code: "DATABASE_UNREACHABLE",
      },
      { status: 503 },
    );
  }
  console.error(err);
  return Response.json({ error: "Unexpected server error", code: "INTERNAL" }, { status: 500 });
}

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 0) throw new EngineError("INVALID_ID", "Invalid market id.");
  return id;
}
