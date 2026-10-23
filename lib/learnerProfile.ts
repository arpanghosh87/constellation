import { z } from "zod";
import type { LearnerProfile } from "./types";

/** Free text from the client is context, not a contract: trim it rather than reject the request. */
export const clippedText = (max: number) => z.string().transform((s) => s.slice(0, max));

export const LEARNER_LIMITS = { concept: 120, text: 240, learned: 40, weakSpots: 10 } as const;

export const learnerSchema = z
  .object({
    learned: z
      .array(
        z.object({
          ref: z.string().max(10),
          concept: clippedText(LEARNER_LIMITS.concept),
          headline: clippedText(LEARNER_LIMITS.text),
        }),
      )
      .transform((a) => a.slice(-LEARNER_LIMITS.learned)),
    weakSpots: z
      .array(
        z.object({
          ref: z.string().max(10),
          concept: clippedText(LEARNER_LIMITS.concept),
          gap: clippedText(LEARNER_LIMITS.text),
        }),
      )
      .transform((a) => a.slice(-LEARNER_LIMITS.weakSpots)),
  })
  .default({ learned: [], weakSpots: [] });

/** Prompt blocks describing the learner; empty string when there's nothing to say. */
export function learnerBlocks(learner: LearnerProfile) {
  const parts: string[] = [];
  if (learner.learned.length) {
    parts.push(
      `<learned_concepts>\n${learner.learned.map((l) => `${l.ref}: ${l.concept} — "${l.headline}"`).join("\n")}\n</learned_concepts>`,
    );
  }
  if (learner.weakSpots.length) {
    parts.push(
      `<weak_spots>\n${learner.weakSpots.map((w) => `${w.ref}: ${w.concept} — ${w.gap}`).join("\n")}\n</weak_spots>`,
    );
  }
  return parts.join("\n\n");
}
