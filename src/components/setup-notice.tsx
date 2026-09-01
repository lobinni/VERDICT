import { Database, BookOpen } from "lucide-react";

export type DatabaseProblem = "missing" | "unreachable";

/**
 * Shown instead of crashing when the indexer database is not usable yet —
 * typical for a fresh deployment whose DATABASE_URL is unset, points at a
 * host the runtime cannot reach, or whose schema was never pushed.
 * All copy is plain English, no code snippets.
 */
export function SetupNotice({ problem = "missing" }: { problem?: DatabaseProblem }) {
  const title = problem === "missing" ? "Database setup required" : "Database unreachable";
  return (
    <div className="mx-auto max-w-2xl px-4 pt-20 pb-10 sm:px-6">
      <div className="glass mx-auto flex max-w-xl flex-col items-center rounded-3xl px-8 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-glow/30 bg-glow/10">
          <Database className="h-6 w-6 text-glow" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-paper">{title}</h1>

        {problem === "missing" ? (
          <p className="mt-3 max-w-md text-sm leading-relaxed text-fade">
            This deployment is live, but its indexer database is not connected yet. To finish the
            setup, create a PostgreSQL database, set the DATABASE_URL environment variable on the
            project, then run the one-time schema push described in docs/deployment.md. Redeploy —
            this notice disappears as soon as the database answers.
          </p>
        ) : (
          <div className="mt-3 max-w-md text-left text-sm leading-relaxed text-fade">
            <p>
              The connection string is set, but the database refused the connection. The usual
              fixes, in order:
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                On Supabase, copy the <span className="font-semibold text-paper">Session pooler</span>{" "}
                string from the Connect dialog — not the direct address. The direct address is
                IPv6-only and often unreachable from serverless hosting.
              </li>
              <li>
                Append <span className="font-semibold text-paper">?sslmode=require</span> to the
                string — hosted Postgres requires an encrypted connection.
              </li>
              <li>
                Paste the value without quotes or trailing spaces, save it for the Production
                environment, and trigger a fresh deployment.
              </li>
              <li>
                If tables are reported missing, run the one-time schema push from
                docs/deployment.md against the same string.
              </li>
            </ol>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 rounded-full border border-line bg-ink-900/60 px-5 py-2.5 text-xs text-fade">
          <BookOpen className="h-3.5 w-3.5 text-glow" />
          Full guide in docs/deployment.md
        </div>
      </div>
    </div>
  );
}
