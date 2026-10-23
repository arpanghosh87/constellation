import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { FALLBACK_BETA, FLOW_SYSTEM_PROMPT, MODEL, flowSchema, getClient } from "@/lib/claude";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import type { Flow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  files: z.record(z.string(), z.string()).refine(
    (f) => Object.values(f).reduce((n, c) => n + c.length, 0) < 200_000,
    "Project is too large",
  ),
});

/** Drop anything that doesn't reference a real node, so the renderer never has to. */
function sanitize(flow: Flow): Flow {
  const ids = new Set<string>();
  const nodes = flow.nodes.filter((n) => {
    if (!n.id || ids.has(n.id)) return false;
    ids.add(n.id);
    return true;
  });
  const edgeKeys = new Set<string>();
  const edges = flow.edges.filter((e) => {
    const key = `${e.from}->${e.to}`;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    return true;
  });
  const steps = flow.steps.filter((s) => ids.has(s.from) && ids.has(s.to));
  return { ...flow, nodes, edges, steps };
}

export async function POST(req: Request) {
  if (!(await checkRateLimit("flow", clientIp(req)))) {
    return Response.json({ error: "Too many maps at once. Try again in a few minutes." }, { status: 429 });
  }
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  }

  const fileBlocks = Object.entries(parsed.data.files)
    .map(([path, content]) => `<file path="${path}">\n${content}\n</file>`)
    .join("\n");

  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: FLOW_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `${fileBlocks}\n\nMap how this app works.` }],
      output_config: { effort: "medium", format: betaZodOutputFormat(flowSchema) },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return Response.json({ error: "Couldn't map this app." }, { status: 502 });
    }
    const flow = sanitize(response.parsed_output);
    if (flow.nodes.length < 2) return Response.json({ error: "Couldn't map this app." }, { status: 502 });
    return Response.json({ flow });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "The server's Claude API key is missing or invalid." }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Claude is rate limited. Try again shortly." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return Response.json({ error: `Claude API error (${err.status ?? "network"}).` }, { status: 502 });
    }
    console.error("Flow failed", err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
