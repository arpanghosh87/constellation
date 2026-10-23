import { z } from "zod";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { CATEGORIES } from "@/lib/types";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  glintId: z.string().max(100),
  rating: z.enum(["up", "down"]),
  reason: z.string().max(200).nullable(),
  concept: z.string().max(200),
  category: z.enum(CATEGORIES),
  headline: z.string().max(300),
  source: z.enum(["glint", "ask-why"]),
});

// No database in the MVP: feedback goes to the server log as one JSON line,
// searchable in Vercel's log viewer with `[lesson-feedback]`.
export async function POST(req: Request) {
  if (!(await checkRateLimit("feedback", clientIp(req)))) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  console.log("[lesson-feedback]", JSON.stringify({ ...parsed.data, at: new Date().toISOString() }));
  return Response.json({ ok: true });
}
