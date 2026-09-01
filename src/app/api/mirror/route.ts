import {
  mirrorClaim,
  mirrorPosition,
  mirrorResolve,
  MirrorError,
  type MirrorClaimPayload,
  type MirrorPositionPayload,
  type MirrorResolvePayload,
} from "@/lib/mirror";

export const dynamic = "force-dynamic";

/** Best-effort observability mirror for MetaMask-signed on-chain actions. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    switch (body.action) {
      case "position":
        return Response.json(await mirrorPosition(body as unknown as MirrorPositionPayload));
      case "resolve":
        return Response.json(await mirrorResolve(body as unknown as MirrorResolvePayload));
      case "claim":
        return Response.json(await mirrorClaim(body as unknown as MirrorClaimPayload));
      default:
        return Response.json({ error: "Unknown mirror action", code: "BAD_ACTION" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof MirrorError) return Response.json({ error: err.message }, { status: 400 });
    console.error(err);
    return Response.json({ error: "Mirror failed" }, { status: 500 });
  }
}
