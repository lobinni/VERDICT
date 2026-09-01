import { jsonError } from "@/lib/api";
import { listActivity } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 60);
    return Response.json({ activity: await listActivity(Number.isFinite(limit) ? limit : 60) });
  } catch (err) {
    return jsonError(err);
  }
}
