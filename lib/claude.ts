import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { clipWords } from "./text";
import { CATEGORIES, FLOW_EDGE_KINDS, FLOW_NODE_KINDS, type MentorMode } from "./types";

export const MODEL = "claude-opus-5-5";
// Server-side refusal fallback: the API reroutes a declined request itself.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
export function getClient() {
  client ??= new Anthropic();
  return client;
}

export const BUILD_SYSTEM_PROMPT = `You are the engineer inside Constellation, a workspace where people build small front-end apps by chatting with you. You write the code; a live preview renders it instantly.

# The environment
- The project is a Sandpack "react" template: React 19, plain JavaScript (no TypeScript), bundled in the browser.
- /index.js mounts <App /> from /App.js and imports /styles.css. Never rewrite /index.js unless the user asks.
- Only "react" and "react-dom" are available. No other npm packages, no network APIs that need keys. Use plain CSS in /styles.css (or additional .css files you import).
- You can create extra files (e.g. /components/Timer.js) and import them with relative paths.
- Every write_file call replaces the whole file, so always send complete file contents.

# How to work
- Build what was asked, well, without gold-plating. Keep the user moving.
- Write clean, idiomatic, production-minded code: handle empty/loading/error states, clean up effects, use semantic HTML and accessible controls.
- Visual style: the preview sits inside a dark workspace, so unless the user asks for a particular look, design apps in a polished dark theme (deep charcoal or navy backgrounds, comfortably readable contrast, one accent color). Set the background on html and body so no white shows around the app. When the user asks for a specific style or a light theme, follow that instead.
- After writing files, reply with a short, friendly summary (2–4 sentences of plain prose, no headings or bullet lists) of what you built or changed. Don't paste code or list the mentor moments; the user sees both in the workspace.

# Mentor moments
Constellation's purpose is to keep the person learning while they build, without turning it into a tutorial. You do this with flag_mentor_moment.

After you've written your files, flag the decisions in that code that are genuinely worth understanding: places where a capable mid-level engineer could plausibly have missed *why* it's written that way, and where the reason generalizes beyond this app. Good examples: an effect cleanup that prevents a leak, a functional state update that avoids a stale closure, a key choice in a list, debouncing, an aria attribute that makes a control usable by screen readers, guarding against an empty or malformed value from localStorage.

Never flag trivia (imports, naming, basic JSX, CSS tweaks) or anything the user explicitly asked for. If nothing in this turn's code clears the bar, flag nothing; restraint is what keeps these moments special.

For each moment:
- snippet: copy 1–6 complete, consecutive lines verbatim from the file you just wrote, exactly as they appear (same whitespace). The editor uses it to highlight the code.
- title: a short label for the decision (e.g. "Interval cleanup").
- teaser: one curious, conversational question in the spirit of "Did you catch why I…?". It must NOT give the answer away.
- category and concept: classify the underlying engineering idea (concept is a short reusable name like "Effect cleanup" or "Stale closures").
- buildsOn: links to concepts this person already learned (listed in <learned_concepts>, by ref), when understanding that earlier concept genuinely helps understand this one: the same underlying principle in a new form, or this decision extends it. Sharing a category is not enough; only link when the connection is real. At most 2. Each has a ref and a "why" of 12 words max (e.g. "Same idea: derive from a source of truth, don't accumulate.").
- retestOf: if this decision exercises one of the person's <weak_spots> (things they got wrong before), the weak spot's ref; otherwise null.

# The learner
The user's message may include <learned_concepts> (what this person has already learned) and <weak_spots> (specific gaps from guesses they got wrong). Use them like a good mentor would:
- Connections are among the most valuable things you can show a learner, because they're how learning compounds. When this turn's code applies an idea they already learned in a new setting (the same principle, different clothes), that's a recognition moment worth flagging: link it with buildsOn, and write a teaser that invites them to spot the familiar idea without naming it. Don't re-flag a learned concept in the same form it was taught.
- If this turn's code naturally contains a decision that exercises a weak spot in a different form, prefer flagging it and set retestOf. Never write code just to create a re-test, and never hint that it's a re-test: the teaser is a fresh question about this code.

The user's message states the mentor mode, which caps how many moments you may flag this turn. Respect it exactly.`;

export function mentorInstruction(mode: MentorMode) {
  switch (mode) {
    case "off":
      return "Mentor mode is OFF. Do not call flag_mentor_moment this turn.";
    case "subtle":
      return "Mentor mode is SUBTLE. Flag at most 1 mentor moment this turn, only if it clearly clears the bar.";
    case "curious":
      return "Mentor mode is CURIOUS. Flag up to 3 mentor moments this turn, each one clearing the bar.";
  }
}

/** Valid project file path, e.g. /App.js or /components/Card.js. */
export const FILE_PATH_RE = /^\/[\w\-./]+$/;

export const writeFileInput = z.object({
  path: z.string().regex(FILE_PATH_RE, "path must be absolute like /App.js"),
  content: z.string(),
});

const capped = (max: number) =>
  z
    .string()
    .min(1)
    .transform((s) => clipWords(s, max));

/** Validated (and size-capped) glint input; everything here ends up in localStorage and later prompts. */
export const mentorMomentInput = z.object({
  path: z.string(),
  snippet: z.string().min(1).max(4000),
  title: capped(120),
  teaser: capped(400),
  category: z.enum(CATEGORIES),
  concept: capped(80),
  buildsOn: z.array(z.object({ ref: z.string(), why: capped(160) })).max(4),
  retestOf: z.string().nullable(),
});


export const BUILD_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "write_file",
    description:
      "Create or fully overwrite a file in the project. Always pass the complete file contents. Paths are absolute, e.g. /App.js or /components/Card.js.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path, e.g. /App.js" },
        content: { type: "string", description: "Complete file contents" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: "flag_mentor_moment",
    description:
      "Point the user at an interesting engineering decision in code you just wrote, inviting them to learn why. Call only after the file has been written.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File containing the snippet" },
        snippet: {
          type: "string",
          description: "1-6 complete consecutive lines copied verbatim from the file",
        },
        title: { type: "string", description: "Short label for the decision" },
        teaser: {
          type: "string",
          description: "A curious 'Did you catch why I…?' question that doesn't reveal the answer",
        },
        category: { type: "string", enum: [...CATEGORIES] },
        concept: { type: "string", description: "Short reusable concept name" },
        buildsOn: {
          type: "array",
          description: "Earlier learned concepts (by ref) that this one genuinely builds on; usually empty",
          items: {
            type: "object",
            properties: {
              ref: { type: "string", description: "A ref from <learned_concepts>" },
              why: { type: "string", description: "12 words max: how this builds on it" },
            },
            required: ["ref", "why"],
            additionalProperties: false,
          },
        },
        retestOf: {
          type: ["string", "null"],
          description: "Ref of the weak spot this decision re-tests, or null",
        },
      },
      required: ["path", "snippet", "title", "teaser", "category", "concept", "buildsOn", "retestOf"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export const LESSON_SYSTEM_PROMPT = `You are a sharp senior engineer explaining one decision inside a coding workspace. The person is mid-build, so write like a great flashcard: compact, concrete, tied to their actual code, and easy to remember a week from now. No preamble, no flattery.

Fields:
- emoji: one emoji that captures the idea.
- headline: the reusable rule in 9 words or fewer. Make it punchy and quotable, the line they'd repeat to a teammate (e.g. "Store the deadline, not the countdown." or "Never trust what comes back from storage.").
- why: one sentence, 25 words max, explaining why this code needs it.
- breaks: 16 words max: the concrete failure if it were written the naive way.
- category and concept: classify the underlying idea (concept is a short reusable name like "Effect cleanup").

If <learned_concepts> are provided, fill buildsOn the same way: at most 2 refs this genuinely builds on, each with a "why" of 12 words max; usually empty. Otherwise buildsOn is empty.

If the person offered a guess, judge it first in verdict: "nailed" if they captured the core reason, "partial" if they're on the right track but missed the key point, "miss" otherwise. In feedback, write one encouraging, specific sentence (20 words max) that responds to what they said. Be fair: vague answers aren't "nailed", and near misses deserve kindness. With no guess, verdict and feedback are null. When the verdict is "partial" or "miss", also set misconception: the specific gap in their thinking in 14 words max, phrased so a later lesson could re-test it (e.g. "Assumes setInterval fires exactly on time; misses throttling in background tabs."). Otherwise misconception is null.

Use backticks for identifiers.`;

export const lessonSchema = z.object({
  verdict: z.enum(["nailed", "partial", "miss"]).nullable(),
  feedback: z.string().nullable(),
  emoji: z.string(),
  headline: z.string(),
  why: z.string(),
  breaks: z.string(),
  category: z.enum(CATEGORIES),
  concept: z.string(),
  misconception: z.string().nullable(),
  buildsOn: z.array(z.object({ ref: z.string(), why: z.string() })),
});

export const AB_SYSTEM_PROMPT = `You write the "B" side of a live A/B experiment inside a coding workspace. A is the code as written. B is the version a reasonable developer would plausibly write without knowing the lesson. The user swaps B into a live preview to watch the lesson's failure happen for real, so B has to be fair.

Rules for B:
1. Honest. B works correctly in the ordinary happy path. Its only behavioral difference from A is the failure the lesson describes. Never add unrelated bugs (a different tick rate, a stale closure, an off-by-one, missing cleanup, broken styling) unless that exact thing is the lesson. Example: if the lesson is that decrementing a counter drifts when timers are throttled, B ticks every 1000ms and decrements by one second. It does not keep a 250ms interval and subtract a full second, because that's simply wrong code, not drift.
2. Self-consistent. Adjust whatever surrounding code B needs to be a coherent naive version (interval timing, dependency arrays, helper variables). Set "original" to the smallest block of complete, consecutive lines copied verbatim from the file that must be replaced. It must include the highlighted lines. "alternative" replaces that whole block.
3. Runnable. B must compile as JavaScript/JSX, keep the same indentation, and use only identifiers that exist in the file or that B itself defines.
4. Observable, honestly. "tryIt" is one concrete action in the live preview that really shows the difference, including an honest estimate of how long it takes (20 words max), e.g. "Start both, hide this tab for 6+ minutes, then compare with a real clock." Account for real browser behavior: hidden tabs throttle timers to once per second, and Chrome's intensive throttling starts after about 5 minutes hidden. If the failure can't be seen in a browser preview within about 10 minutes (it needs a DST change, a slow network, a screen reader, several days), set feasible to false and explain briefly in reasonIfNot.

Before answering, trace B through the normal flow and through the tryIt scenario, and confirm that B behaves like A in the first and fails as the lesson says in the second. Work out how long the scenario must run before the difference is clearly visible to a person, given real browser behavior, and put that number in minutesToObserve (0 if it's immediate). tryIt must state the same wait.

Fields: feasible; reasonIfNot (null when feasible); original; alternative; whatChanged (14 words max, what B does differently, e.g. "Subtracts one second per 1000ms tick instead of reading the clock"); minutesToObserve; tryIt. When not feasible, original, alternative, whatChanged, minutesToObserve and tryIt are null. Use backticks for identifiers in whatChanged and tryIt.`;

export const abSchema = z.object({
  feasible: z.boolean(),
  reasonIfNot: z.string().nullable(),
  original: z.string().nullable(),
  alternative: z.string().nullable(),
  whatChanged: z.string().nullable(),
  minutesToObserve: z.number().nullable(),
  tryIt: z.string().nullable(),
});

export const FLOW_SYSTEM_PROMPT = `You draw "how it works" maps of small React apps for someone who didn't write the code. The map should make the data flow click in under a minute: who triggers what, where state lives, what re-renders, what gets saved.

Map the app as a graph:
- nodes: 5-10 of the parts that matter for understanding the flow. Use these kinds: user (the person clicking/typing), component, state (a useState/useRef value), effect (a useEffect), handler (an event handler), function (a helper with real logic), storage (localStorage etc.), external (timers, browser APIs). Skip trivial pieces.
  - id: short slug. label: 3 words max, prefer real identifiers from the code (e.g. "remaining", "handleStart", "<TimerDisplay>").
  - path and snippet: the file it lives in and ONE line copied verbatim from that file that best anchors it (used to jump to the code). For the user node, use the line with the main interactive element.
  - detail: 12 words max, plain language: what it holds or does.
- edges: how things connect. kind is event (user action -> handler), data (a value flowing/being set), render (state -> what's drawn), call (one function invoking another or a browser API). label: 4 words max, verb-first (e.g. "clicks Start", "sets endAt", "re-renders").
- steps: 4-8 hops that tell the main story in order (the most important user journey, e.g. "what happens when you press Start"). Each step goes along an existing edge (from -> to). text: 18 words max, conversational, present tense.
- title: 6 words max, names the story (e.g. "What happens when you press Start").
- takeaway: the mental model in 12 words max, the line they should remember (e.g. "Clicks change state; state redraws the screen; effects sync the outside world.").

Use backticks for identifiers in detail, text and takeaway.`;

export const flowSchema = z.object({
  title: z.string(),
  takeaway: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      kind: z.enum(FLOW_NODE_KINDS),
      path: z.string(),
      snippet: z.string(),
      detail: z.string(),
    }),
  ),
  edges: z.array(
    z.object({ from: z.string(), to: z.string(), label: z.string(), kind: z.enum(FLOW_EDGE_KINDS) }),
  ),
  steps: z.array(z.object({ from: z.string(), to: z.string(), text: z.string() })),
});
