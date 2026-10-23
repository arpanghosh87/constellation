import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  BUILD_SYSTEM_PROMPT,
  BUILD_TOOLS,
  FALLBACK_BETA,
  FILE_PATH_RE,
  MODEL,
  getClient,
  mentorInstruction,
  mentorMomentInput,
  writeFileInput,
} from "@/lib/claude";
import { extractStringField } from "@/lib/partialJson";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { learnerBlocks, learnerSchema } from "@/lib/learnerProfile";
import type { BuildEvent, LearnerProfile, MentorMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TOOL_ROUNDS = 8;
const PROGRESS_INTERVAL_MS = 80;

const requestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }))
    .max(20),
  files: z.record(z.string(), z.string()).refine(
    (f) => Object.values(f).reduce((n, c) => n + c.length, 0) < 200_000,
    "Project is too large",
  ),
  mentor: z.enum(["off", "subtle", "curious"]),
  learner: learnerSchema,
});

type BuildRequest = z.infer<typeof requestSchema>;

function buildUserTurn({ prompt, history, files, mentor, learner }: BuildRequest) {
  const transcript = history
    .map((m) => `<${m.role}>${m.text}</${m.role}>`)
    .join("\n");
  const fileBlocks = Object.entries(files)
    .map(([path, content]) => `<file path="${path}">\n${content}\n</file>`)
    .join("\n");
  return [
    transcript && `<conversation_so_far>\n${transcript}\n</conversation_so_far>`,
    `<current_files>\n${fileBlocks}\n</current_files>`,
    mentor === "off" ? "" : learnerBlocks(learner),
    `<mentor_mode>${mentorInstruction(mentor)}</mentor_mode>`,
    `<request>\n${prompt}\n</request>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

type ToolBlockState = {
  name: string;
  id: string;
  buf: string;
  lastSent: number;
  lastLen: number;
};

export async function POST(req: Request) {
  if (!(await checkRateLimit("build", clientIp(req)))) {
    return Response.json(
      { error: "You're building fast! Take a breather and try again in a few minutes." },
      { status: 429 },
    );
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  }
  const body = parsed.data;
  const client = getClient();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (e: BuildEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

      const budget: GlintBudget = { mentor: body.mentor, glints: 0 };
      // With the mentor off, the model isn't offered the tool at all.
      const tools = body.mentor === "off" ? BUILD_TOOLS.filter((t) => t.name !== "flag_mentor_moment") : BUILD_TOOLS;
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        { role: "user", content: buildUserTurn(body) },
      ];

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const s = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 64000,
              system: [
                { type: "text", text: BUILD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
              ],
              tools,
              messages,
              output_config: { effort: "medium" },
              thinking: { type: "adaptive", display: "summarized" },
              betas: [FALLBACK_BETA],
              fallbacks: "default",
            },
            { signal: req.signal },
          );

          const toolBlocks = new Map<number, ToolBlockState>();

          for await (const event of s) {
            if (event.type === "content_block_start") {
              const block = event.content_block;
              if (block.type === "thinking" || block.type === "redacted_thinking") {
                emit({ type: "status", status: "thinking" });
              } else if (block.type === "tool_use") {
                toolBlocks.set(event.index, {
                  name: block.name,
                  id: block.id,
                  buf: "",
                  lastSent: 0,
                  lastLen: -1,
                });
                emit({ type: "status", status: "writing" });
              }
            } else if (event.type === "content_block_delta") {
              const delta = event.delta;
              if (delta.type === "thinking_delta") {
                if (delta.thinking) emit({ type: "thought", text: delta.thinking });
              } else if (delta.type === "text_delta") {
                emit({ type: "text", text: delta.text });
              } else if (delta.type === "input_json_delta") {
                const tb = toolBlocks.get(event.index);
                if (!tb || tb.name !== "write_file") continue;
                tb.buf += delta.partial_json;
                const now = Date.now();
                if (now - tb.lastSent < PROGRESS_INTERVAL_MS) continue;
                const path = extractStringField(tb.buf, "path");
                const content = extractStringField(tb.buf, "content");
                if (path?.complete && FILE_PATH_RE.test(path.value) && content && content.value.length !== tb.lastLen) {
                  tb.lastSent = now;
                  tb.lastLen = content.value.length;
                  emit({ type: "file_progress", id: tb.id, path: path.value, content: content.value });
                }
              }
            }
          }

          const message = await s.finalMessage();
          // Append-only history: the assistant turn goes back verbatim
          // (thinking and fallback blocks included).
          messages.push({ role: "assistant", content: message.content });

          if (message.stop_reason === "refusal") {
            emit({ type: "error", message: "Claude declined this request. Try rephrasing it." });
            break;
          }

          const toolUses = message.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
          );
          if (message.stop_reason === "max_tokens" && toolUses.length) {
            emit({ type: "error", message: "That response got too long to finish. Try a smaller step." });
            break;
          }
          if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

          const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((tu) =>
            runTool(tu, emit, body.learner, budget),
          );
          messages.push({ role: "user", content: results });
        }
        emit({ type: "done" });
      } catch (err) {
        if (req.signal.aborted) {
          // Client navigated away or hit stop; nothing to report.
        } else if (err instanceof Anthropic.AuthenticationError) {
          emit({ type: "error", message: "The server's Claude API key is missing or invalid." });
        } else if (err instanceof Anthropic.RateLimitError) {
          emit({ type: "error", message: "Claude is rate limited right now. Try again in a moment." });
        } else if (err instanceof Anthropic.APIError) {
          console.error("Claude API error", err.status, err.message);
          emit({ type: "error", message: `Claude API error (${err.status ?? "network"}).` });
        } else {
          console.error("Build stream failed", err);
          emit({ type: "error", message: "Something went wrong while building." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

const MENTOR_LIMIT: Record<MentorMode, number> = { off: 0, subtle: 1, curious: 3 };

type GlintBudget = { mentor: MentorMode; glints: number };

function runTool(
  tu: Anthropic.Beta.BetaToolUseBlock,
  emit: (e: BuildEvent) => void,
  learner: LearnerProfile,
  budget: GlintBudget,
): Anthropic.Beta.BetaToolResultBlockParam {
  const fail = (msg: string): Anthropic.Beta.BetaToolResultBlockParam => ({
    type: "tool_result",
    tool_use_id: tu.id,
    content: msg,
    is_error: true,
  });

  // Eager input streaming skips server-side validation, so validate here.
  if (tu.name === "write_file") {
    const input = writeFileInput.safeParse(tu.input);
    if (!input.success) return fail(`Invalid input: ${input.error.issues[0]?.message}`);
    emit({ type: "file_done", id: tu.id, ...input.data });
    return { type: "tool_result", tool_use_id: tu.id, content: `Saved ${input.data.path}` };
  }

  if (tu.name === "flag_mentor_moment") {
    // The dial is enforced here, not just requested in the prompt.
    if (budget.glints >= MENTOR_LIMIT[budget.mentor]) {
      return fail("Mentor-moment limit for this turn is reached. Don't flag any more this turn.");
    }
    const input = mentorMomentInput.safeParse(tu.input);
    if (!input.success) return fail(`Invalid input: ${input.error.issues[0]?.message}`);
    // Only keep links and re-tests that point at something real in the profile.
    const learnedRefs = new Set(learner.learned.map((l) => l.ref));
    const weakRefs = new Set(learner.weakSpots.map((w) => w.ref));
    const buildsOn = uniqueBy(input.data.buildsOn.filter((b) => learnedRefs.has(b.ref)), (b) => b.ref).slice(0, 2);
    const retestOf = input.data.retestOf && weakRefs.has(input.data.retestOf) ? input.data.retestOf : null;
    budget.glints++;
    emit({ type: "glint", glint: { id: tu.id, ...input.data, buildsOn, retestOf } });
    return { type: "tool_result", tool_use_id: tu.id, content: "Shown to the user." };
  }

  return fail(`Unknown tool ${tu.name}`);
}

function uniqueBy<T>(items: T[], key: (t: T) => string) {
  const seen = new Set<string>();
  return items.filter((t) => {
    const k = key(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
