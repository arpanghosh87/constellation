import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  FALLBACK_BETA,
  LESSON_SYSTEM_PROMPT,
  MODEL,
  getClient,
  lessonSchema,
} from "@/lib/claude";
import { clippedText, learnerBlocks, learnerSchema } from "@/lib/learnerProfile";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import type { Lesson, LessonEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  path: z.string().max(200),
  snippet: z.string().min(1).max(4000),
  fileContent: z.string().max(60_000),
  title: clippedText(200).nullable(),
  teaser: clippedText(500).nullable(),
  guess: z.string().max(2000).nullable(),
  learner: learnerSchema,
});

export async function POST(req: Request) {
  if (!(await checkRateLimit("lesson", clientIp(req)))) {
    return Response.json({ error: "Too many lessons at once. Try again in a few minutes." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  }
  const { path, snippet, fileContent, title, teaser, guess, learner } = parsed.data;

  const prompt = [
    `<file path="${path}">\n${fileContent}\n</file>`,
    `<highlighted_code>\n${snippet}\n</highlighted_code>`,
    title || teaser
      ? `<mentor_prompt>${[title, teaser].filter(Boolean).join(" — ")}</mentor_prompt>`
      : "<mentor_prompt>The user selected this code themselves and asked: why is it written this way?</mentor_prompt>",
    guess ? `<user_guess>${guess}</user_guess>` : "<user_guess>none</user_guess>",
    learnerBlocks({ learned: learner.learned, weakSpots: [] }),
  ]
    .filter(Boolean)
    .join("\n\n");

  // Stream the structured output so the flashcard fills in as it's written.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (e: LessonEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const s = getClient().beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 16000,
            system: LESSON_SYSTEM_PROMPT,
            messages: [{ role: "user", content: prompt }],
            output_config: { effort: "low", format: betaZodOutputFormat(lessonSchema) },
            thinking: { type: "adaptive", display: "summarized" },
            betas: [FALLBACK_BETA],
            fallbacks: "default",
          },
          { signal: req.signal },
        );
        for await (const event of s) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") emit({ type: "delta", text: event.delta.text });
          else if (event.delta.type === "thinking_delta" && event.delta.thinking) {
            emit({ type: "thought", text: event.delta.thinking });
          }
        }
        const message = await s.finalMessage();
        const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const parsedLesson = message.stop_reason === "refusal" ? null : lessonSchema.safeParse(safeJson(text));
        if (!parsedLesson?.success) {
          emit({ type: "error", message: "Couldn't generate a lesson for this one." });
          return;
        }
        const lesson: Lesson = parsedLesson.data;
        if (!guess) {
          lesson.verdict = null;
          lesson.feedback = null;
        }
        if (lesson.verdict !== "partial" && lesson.verdict !== "miss") lesson.misconception = null;
        const refs = new Set(learner.learned.map((l) => l.ref));
        lesson.buildsOn = lesson.buildsOn.filter((b) => refs.has(b.ref)).slice(0, 2);
        emit({ type: "lesson", lesson });
      } catch (err) {
        if (req.signal.aborted) return;
        if (err instanceof Anthropic.RateLimitError) {
          emit({ type: "error", message: "Claude is rate limited. Try again shortly." });
        } else if (err instanceof Anthropic.APIError) {
          console.error("Claude API error", err.status, err.message);
          emit({ type: "error", message: `Claude API error (${err.status ?? "network"}).` });
        } else {
          console.error("Lesson failed", err);
          emit({ type: "error", message: "Something went wrong." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
