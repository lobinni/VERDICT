import { DatabaseNotConfiguredError, db, isDatabaseError } from "@/db";
import { storageMode } from "@/lib/store";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  // Zero-config mode: no database required, the in-memory store serves reads
  // and writes for the current process lifetime.
  if (storageMode() === "memory") {
    return Response.json({ ok: true, storage: "memory" });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, storage: "postgres" });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return Response.json({ ok: false, database: "not_configured" }, { status: 503 });
    }
    if (isDatabaseError(err)) {
      return Response.json({ ok: false, database: "unreachable" }, { status: 503 });
    }
    return Response.json({ ok: false }, { status: 500 });
  }
}
