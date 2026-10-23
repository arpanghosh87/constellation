import Anthropic from "@anthropic-ai/sdk";
import { parse as parseJs } from "@babel/parser";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { swapInAlternative } from "@/lib/ab";
import { AB_SYSTEM_PROMPT, FALLBACK_BETA, MODEL, abSchema, getClient } from "@/lib/claude";
import { clippedText } from "@/lib/learnerProfile";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { findSnippetLines } from "@/lib/snippet";
import type { AbVariant } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_ATTEMPTS = 2;

const requestSchema = z.object({
  path: z.string().max(200),
  snippet: z.string().min(1).max(4000),
  fileContent: z.string().max(60_000),
  headline: clippedText(300),
  why: clippedText(1000),
  breaks: clippedText(1000),
});

type Check = { ok: true; ab: AbVariant } | { ok: false; problem: string };

/** Everything that can be verified mechanically before B reaches the preview. */
function check(out: z.infer<typeof abSchema>, path: string, file: string, snippet: string): Check {
  const { original, alternative, whatChanged, tryIt, minutesToObserve } = out;
  if (!original || !alternative || !whatChanged || !tryIt || minutesToObserve === null) {
    return { ok: false, problem: "Fill in original, alternative, whatChanged, minutesToObserve and tryIt when feasible is true." };
  }
  const region = findSnippetLines(file, original);
  if (!region) return { ok: false, problem: "`original` was not found verbatim in the file. Copy complete lines exactly." };
  const highlighted = findSnippetLines(file, snippet);
  if (highlighted && (highlighted.start < region.start || highlighted.end > region.end)) {
    return { ok: false, problem: "`original` must contain all of the highlighted lines." };
  }
  const swapped = swapInAlternative(file, original, alternative);
  if (swapped === null || swapped === file) return { ok: false, problem: "B must actually change the code." };
  if (/\.(jsx?|tsx?)$/.test(path)) {
    try {
      parseJs(swapped, { sourceType: "module", plugins: ["jsx"] });
    } catch (e) {
      return { ok: false, problem: `The file no longer parses with B swapped in: ${(e as Error).message}` };
    }
  }
  return { ok: true, ab: { original, alternative, whatChanged, tryIt, minutesToObserve: Math.max(0, Math.round(minutesToObserve)) } };
}

export async function POST(req: Request) {
  if (!(await checkRateLimit("lesson", clientIp(req)))) {
    return Response.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  }
  const { path, snippet, fileContent, headline, why, breaks } = parsed.data;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        `<file path="${path}">\n${fileContent}\n</file>`,
        `<highlighted_code>\n${snippet}\n</highlighted_code>`,
        `<lesson>\nRule: ${headline}\nWhy: ${why}\nWithout it: ${breaks}\n</lesson>`,
        "Write B for this lesson.",
      ].join("\n\n"),
    },
  ];

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await getClient().beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: AB_SYSTEM_PROMPT,
        messages,
        output_config: { effort: "medium", format: betaZodOutputFormat(abSchema) },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });
      const out = response.parsed_output;
      if (response.stop_reason === "refusal" || !out) break;
      if (!out.feasible) {
        return Response.json({ ab: null, reason: out.reasonIfNot ?? "No fair B version for this one." });
      }

      const result = check(out, path, fileContent, snippet);
      if (result.ok) return Response.json({ ab: result.ab });

      console.warn(`[ab] attempt ${attempt} rejected: ${result.problem}`);
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: `That B can't be used: ${result.problem} Please fix it.` });
    }
    return Response.json({ ab: null, reason: "Couldn't produce a B that runs cleanly for this one." });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Claude is rate limited. Try again shortly." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return Response.json({ error: `Claude API error (${err.status ?? "network"}).` }, { status: 502 });
    }
    console.error("A/B failed", err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
