# Constellation: Design Document

> A coding workspace where Claude builds your app and, now and then, points at a decision worth understanding. Curiosity earns stars, stars form a constellation, and the constellation shows how your knowledge connects.

- **Live prototype:** https://constellation-pied-gamma.vercel.app (access-code gated)
- **Code:** private repo `arpanghosh87/constellation` (Next.js 15, TypeScript). About 6,000 lines of app code.
- **Model:** Claude Opus 5.5 (`claude-opus-5-5`) for every Claude call.

---

## 1. Problem and solution

### The problem
AI coding agents are now good enough that people can ship working software without understanding it. That's a real productivity gain, but it has a cost: engineers drift away from the craft. They stop forming the mental models that let them debug, review, design and grow. They lose the learning, the curiosity, and the satisfaction of knowing *why* something works. The more capable the agent, the stronger the pull to accept its output unexamined.

Existing answers are a poor fit:
- **Tutorials and courses** are separate from real work, so they feel like homework and slow you down.
- **Asking the AI to explain everything** makes it verbose; people skip it.
- **Writing the code yourself** gives up the productivity that made agents valuable in the first place.

### The solution
Constellation keeps the speed of AI-assisted building and adds a *mentor* layer that's rare, opt-in and immediately relevant:

1. **Build normally.** Describe an app in chat. Claude writes it, streaming code into a live editor with a running preview.
2. **Glints.** While building, Claude flags the few decisions in *its own code* that are genuinely worth understanding: an effect cleanup, a stale-closure guard, a timestamp-based timer. It asks a curious question ("Did you catch why I…?"). The lines glow in the editor. Nothing blocks you.
3. **Learn in 30 seconds, if you want to.** Tap a glint. You can guess first (a correct guess earns double stars) or just ask. The answer is a compact flashcard: one memorable rule, one "why", and one "what breaks without it".
4. **See it break for real.** An A/B experiment swaps a fair, naive version of the code into the live preview, so you watch the failure happen yourself.
5. **See how it works.** An interactive data-flow map walks through the app step by step, with the editor highlighting each step's code.
6. **Watch knowledge compound.** Each concept becomes a star. New concepts link to ones you learned earlier ("builds on Timer drift"), and lines form between them. Wrong guesses are remembered and quietly re-tested later. Each round ends with a shareable debrief card.

The goal is better engineers, not only faster vibe-coding.

---

## 2. Which option I chose and why

Several decisions shaped the prototype. For each, here's the choice and the reasoning.

| Decision | Chosen | Alternatives considered | Why |
|---|---|---|---|
| Form factor | **Hosted web app** | VS Code extension; Claude Code plugin | Zero install, shareable by URL, full control of UI (highlighting, diagrams, animation). The core "brain" (lesson, A/B and flow APIs) is portable to an IDE or Claude Code later. |
| What users build | **Front-end React apps with an in-browser live preview (Sandpack)** | Any language without execution; a full execution sandbox | Instant visual feedback, safe to host (no server-side code execution), and A/B experiments are *visible*. |
| Accounts | **None; progress in localStorage** | GitHub OAuth | Zero friction for a prototype. The data is versioned and migratable to a database when a leaderboard or sync is needed. |
| Hosting | **Vercel** | Fly/Render | Native Next.js streaming, serverless API routes keep the API key server-side, and git-push deploys. |
| How mentoring triggers | **Claude flags moments inside its own build (a tool call)** | A separate "explain this file" pass; always-on commentary | The moment is attached to real code at the exact time it's written, so it's relevant and cheap. A cap (the mentor dial) keeps it rare. |
| Lesson format | **Compact flashcard** (emoji, a rule of 9 words or fewer, a ✅ why line, a 💥 without-it line) | Paragraph explanations | The first version was too verbose. A short, quotable rule is what people remember and repeat. |
| Motivation design | **Stars, badges, constellation, debrief** | Points or leaderboard first | Rewards *curiosity and understanding*, not output volume. The constellation visualizes the actual structure of what you know. |

---

## 3. Design and prototyping process

The prototype was built iteratively: build, verify in a real browser, critique, refine. Each step was tested end to end with real Claude calls and scripted browser runs (Playwright with screenshots), and deployed only after local verification.

### Phase 1: Core loop (MVP)
- Planned the experience, architecture, and build order. Scaffolded Next.js with Sandpack, a streaming build route and a lesson route.
- **Key technical choices:**
  - Claude streams `write_file` tool input live into the editor (eager input streaming).
  - `flag_mentor_moment` anchors a glint to a *verbatim snippet* instead of line numbers, because models count lines unreliably.
- **Found and fixed through real-browser testing:**
  - Sandpack's fixed 300px height.
  - An infinite loop syncing the active file between the store and Sandpack.
  - Glint highlights vanishing when the editor was recreated.
  - The preview stuck behind a loading overlay under React StrictMode.
- First deploy, with an access-code gate and per-IP rate limits.

### Phase 2: Making lessons stick
User feedback: lessons were too verbose, and there was no way to explore the alternative. Changes:
- **Compact flashcards** replaced paragraphs.
- **A/B the decision**: swap a naive version into the live preview.
- **👍/👎 per lesson**, with reasons on 👎, logged server-side to tune prompts.

### Phase 3: Seeing the system
- **"How it works" flow maps:** Claude returns a structured graph (nodes, edges, a step-by-step story). It's rendered as an interactive diagram with a walkthrough that animates each hop and highlights the matching code. The camera follows the story so the map stays readable.

### Phase 4: Review-driven fixes (trust)
An external review found four issues that undermine a teaching product:
- **"New project" was dead.** Native `confirm()` is suppressed in some browsers. Replaced with an in-app confirm and a true reset.
- **A/B taught the wrong thing.** The naive timer ticked every 250ms but subtracted a full second, which is simply broken code, not drift.
  - Root cause: B was forced to replace only the highlighted lines.
  - Fix: B is generated on demand with honesty rules (works in the happy path; fails only the way the lesson says), may replace a wider region, and is syntax-checked on the server.
  - Claude also corrected the original claim. Chrome throttles hidden-tab timers to once per second, which doesn't hurt a 1000ms tick, so drift only appears after about 5 minutes hidden. Each B now carries an honest "⏳ minutes to observe".
- **Layout collapsed at narrow widths.** Added three responsive layouts.
- **Long waits felt hung.** Builds now stream Claude's summarized reasoning and a live checklist; lessons stream into the card as they're written.

### Phase 5: Learning that compounds
- **Connected stars:** each build sends a learner profile, and Claude links new glints to concepts learned earlier.
  - A prompting lesson: the first version told Claude not to re-flag learned concepts. That suppressed exactly the most valuable moments, recognizing a known idea in new form. The prompt now encourages these "recognition moments".
- **Misconception memory:** wrong guesses log the specific gap, and a later build quietly re-tests it in a new form.
- **Debrief:** an ending for each round, with a shareable card.

### Phase 6: A living sky
- Pulses of light travel along new connections, stars twinkle at individual rates, the newest stars pulse once since your last visit, and hovering any star shows how it was earned.

### Phase 7: Quality pass
- A thorough code review found 15 issues: data loss on interrupted builds, the preview compiling half-written files, race conditions, a daylight-saving bug in the streak, and unenforced mentor limits. All were fixed and verified with scripted browser tests (intercepted API calls for race conditions) and real API runs.
- **Dark preview:** apps now default to a dark theme matching the workspace, while honoring explicit style requests.

**Process principles:** verify before claiming. Reproduce every bug before fixing it, re-test after fixing, and test generality (not just the case that prompted the fix).

---

## 4. How the design enhances rather than replaces human agency

- **The human stays in charge of building.** Claude writes the code and the user directs it. Mentoring never blocks: glints are side cards, and you can keep prompting without opening any of them.
- **Learning is always opt-in.**
  - The **mentor dial** (Off / Subtle / Curious) lets users choose how much mentoring they want. It's enforced on the server, so Off really means off.
  - Lessons only happen when the user taps a glint, selects code and asks "why?", or opts into a flow map.
- **Guess first.** "Let me guess first" asks the human to *think* before the AI answers, and rewards a correct guess with double stars. The AI grades kindly and responds to what the person actually said.
- **Experiment, don't just read.** A/B lets users run the alternative themselves and observe the consequence. The understanding is theirs, earned by observation.
- **Ask your own questions.** "Why is it written this way?" on any selection lets the learner, not the AI, decide what's interesting.
- **Transparent memory.** When a guess misses, the lesson says "📝 Noted: … I'll check back on this later". The re-test is quiet, but the fact that it's remembered is not.
- **Honesty as a design value.**
  - B versions must be fair.
  - Wait times are real ("⏳ ~8 min to see it").
  - Loading states show real progress, not fake stages.
  - Links between concepts appear only when the connection is real.
- **Builds the user's own judgement.** Each lesson ends in a reusable *principle* the user can apply without the AI.

---

## 5. Learning principles that informed the decisions

| Principle | Where it shows up |
|---|---|
| **Situated / just-in-time learning** | Lessons are about the code you're building right now, at the moment it's written. |
| **Curiosity gap** | Teasers ("Did you catch why I…?") pose a question without the answer. |
| **Retrieval practice and the generation effect** | "Let me guess first" makes the learner generate an answer before seeing it, which strengthens memory more than reading. |
| **Immediate, specific feedback** | Guesses are graded (nailed / partial / miss) with one sentence responding to *what they said*. |
| **Low cognitive load** | Flashcards are deliberately tiny: a rule of 9 words or fewer, a one-line why, a one-line failure. |
| **Memorable encoding** | A quotable rule plus an emoji ("⏱️ Store the deadline, not the countdown"). |
| **Contrasting cases** | A/B shows the right and naive versions side by side and *running*, so learners see the boundary of the concept. |
| **Learning by doing / experiential learning** | Learners trigger the failure themselves in the live preview ("🧪 try this"). |
| **Worked examples and dual coding** | Flow maps pair a visual diagram with the matching code, stepping through the story one hop at a time. |
| **Elaboration and schema building** | "Builds on" links connect new concepts to prior knowledge, and the constellation makes that structure visible. Recognition moments ask learners to spot a known idea in new form (transfer). |
| **Spaced retrieval and targeted re-testing** | Misconceptions are re-tested in a *later* build, in a different form, without warning. |
| **Metacognition and growth mindset** | The Growth section shows "working on it" vs "🌱 cleared", making improvement visible. The Comeback badge rewards fixing a misconception. |
| **Intrinsic motivation (autonomy, competence)** | Opt-in learning and the mentor dial give autonomy. Stars reward understanding (not clicks), and badges mark competence areas. |
| **Closure and reflection** | The debrief ends each round with a summary of what you learned. |
| **Rarity keeps it meaningful** | Claude flags only what clears a bar, capped by the dial. Restraint is a feature. |

---

## 6. How I'd measure success

The north star is **durable understanding per build session, without slowing building down**.

**Engagement with learning (leading indicators)**
- Glint open rate (glints opened ÷ glints shown), and the "guess first" vs "tell me" ratio.
- Ask-why usage (self-initiated curiosity is a strong signal).
- A/B experiments run, and flow walkthroughs completed.
- Lesson 👍/👎 rate and 👎 reasons (already logged as `[lesson-feedback]`).

**Learning outcomes**
- **Guess accuracy over time,** per user and per concept.
- **Misconception clearance rate:** the share of logged gaps later nailed on re-test. This is the strongest signal of real learning.
- **Transfer:** how often recognition moments (a known concept in new form) are guessed correctly.
- **Connections per user** over time: does knowledge compound?
- Optional delayed quizzes on learned rules (for example after 7 days) to measure retention.

**Productivity guardrails (it must not slow people down)**
- Time from prompt to working app, and builds per session, compared with mentor Off.
- Mentor dial distribution (are people turning it off?).
- Glint dismiss / ignore rate.

**Quality of the mentor**
- Share of glints rated 👍; reasons on 👎 ("too obvious", "confusing", "not accurate", "not useful").
- An eval set of prompts and code with expected glints and lessons, graded for accuracy and fairness (especially of A/B variants).

**Experiment design:** A/B test mentor-on vs mentor-off cohorts on later independent tasks (debugging or code review), measuring correctness and time.

---

## 7. How it could scale to millions of users

**Architecture changes**
- **Accounts and storage:** move progress from localStorage to a database (the schemas are already versioned and migratable). Add sync across devices, and a leaderboard if wanted.
- **Rate limiting:** shared limits through Redis (Upstash support is already built in; currently limits are per serverless instance). Per-user quotas replace the shared access code.
- **Sandpack bundler:** self-host the bundler for reliability, cost and privacy at scale.
- **Streaming infrastructure:** builds run up to 300s; at scale, use durable or resumable streams so a dropped connection doesn't lose the build.

**Cost and latency control**
- **Prompt caching:** the system prompt and tool definitions form a stable prefix. Keep learner context in the user turn so caching stays effective.
- **Model routing:** keep the strongest model for building and A/B honesty; evaluate a smaller model for lessons and grading at low effort, using the eval set to guard quality.
- **Effort tuning per route:** builds medium, lessons low, A/B and flow medium.
- **Generate on demand:** A/B variants and flow maps are generated only when requested, and cached until the code changes.
- **Batch offline work** (for example re-scoring eval sets, analytics) with the Batch API.

**Quality at scale**
- Eval suites for glint selection, lesson accuracy, A/B fairness (the honesty rules plus the existing server-side parse check), and link precision.
- Use 👍/👎 data and misconception-clearance data to tune prompts continuously.
- Safety: content moderation on user prompts, refusal handling (already uses server-side fallbacks), and abuse limits.

**Privacy**
- Learner profiles contain concepts and gaps, not code. Code is processed per request. Make retention explicit and give users a "reset my progress" control (`reset` already exists in the store).

---

## 8. How I'd get it adopted by a sister team for long-term implementation

1. **Find the right home.** The mentor layer is most valuable where AI writes code for people: for example a team building an AI coding product (IDE agent, CLI agent, or code review tool).
2. **Package the brain, not just the app.** The core pieces are already separable APIs:
   - **Glint selection:** a tool the agent calls while it writes code.
   - **Lesson** (flashcard plus guess grading), **A/B** (fair naive variant plus server check), and **Flow map** (structured graph).
   - **Learner profile** (concepts, links, misconceptions).

   Offer them as a small SDK or service with a clear contract, so the sister team can integrate without adopting the whole UI.
3. **Start with a low-risk pilot.** Ship it behind a flag with the mentor dial defaulting to Subtle (or Off) for a slice of users. Measure the metrics in section 6 against a control group.
4. **Show evidence, not a demo.** Bring data: open rates, misconception clearance, no slowdown in build time, and 👍 rates. Include qualitative quotes.
5. **Make ownership easy.** Hand over the prompts, eval sets, design doc and runbooks; pair on the first integration; define an owner and an on-call path for prompt regressions.
6. **Align with their goals.** Frame the value in their terms: user retention and trust (users understand and can maintain what the agent ships), fewer support issues, and differentiation.
7. **Plan the roadmap together:** accounts and sync, team or classroom mode, spaced-repetition reviews, IDE-native highlights, and an org-level view of team learning (opt-in and privacy-respecting).

---

## 9. Complete functionality reference

### 9.1 Access and landing
- **Landing page:** headline ("Build fast. Still learn."), a three-step explanation, and a starfield background.
- **Access code gate:** when `ACCESS_CODE` is set, visitors enter it once.
  - It's stored as an httpOnly cookie for 30 days.
  - Middleware protects `/build`, `/constellation` and all Claude API routes. Unauthenticated API calls get 401, and pages redirect to `/?locked=1`.
  - The server compares codes in constant time. With no code configured (local dev), the gate is disabled.

### 9.2 Workspace layout
- **Header:** logo, **New project**, **🏁 Wrap up** (debrief), the **mentor dial**, the **Glints tray**, and the **star counter** (★ total · badges; links to the constellation).
- **Responsive layouts:**
  - **Wide (≥1200px):** chat (360px) | editor | right pane (Preview / How it works tabs). The file explorer appears only at ≥1500px, since editor tabs list files too. Columns have minimum widths so code never wraps token by token.
  - **Medium (760–1199px):** chat (320px) plus one tabbed pane: Code | Preview | How it works.
  - **Narrow (<760px):** everything is tabs: Chat | Code | Preview | How it works. The Chat tab shows a dot when there are unseen glints.
  - Hidden panes stay mounted, so the editor keeps its state and the preview doesn't reload. Lessons switch the pane to Code, and A/B switches it to Preview.
- **New project:** an in-app confirm, explaining that code, chat and glints are cleared and stars stay. If a build is running, it says it will stop it. Reset clears files, chat, glints, map, A/B state and layout, and gives the project a new id.

### 9.3 Building
- **Chat:** an empty state with suggestion chips; Enter to send, Shift+Enter for a newline, up to 4,000 characters.
- **Streaming build:**
  - Claude writes files with `write_file`, and content streams live into the editor while a "writing /App.js…" badge shows.
  - The preview shows a "Building your app…" overlay and recompiles **once the stream finishes**, never on half-written files. The Sandpack editor's auto-reload is disabled for this reason.
- **Live progress:** a checklist in the chat: ✓ Sending your request → ● Planning the approach (with Claude's live summarized reasoning, "💭 …") → ● Writing /App.js 2.1 KB → ✓ Spotted 2 things worth knowing → ● Writing a summary. There's also an elapsed timer, and the bottom status line names the current step.
- **Reply:** a short plain-prose summary (light markdown supported), clickable file chips, glint cards, and offer cards.
- **Stop:** cancels the build at any time.
- **Data safety on interruption:** if the build stops for any reason (Stop, an error, a timeout, or an invalid write) while files are mid-write, edited files are restored to their last complete version and new files are removed. The chat notes it ("Stopped mid-write, so I rolled back …"). A stream that ends without finishing shows an error ("The build was cut off…").
- **Conversation context:** the last 10 turns plus all current files are sent each time. The project is limited to 200 KB.
- **App style:** apps default to a polished dark theme that fits the workspace. Explicit style requests (for example a light pastel look) win. The starter app and the preview frame are dark, so there's no white flash.
- **Allowed stack:** React 19, plain JavaScript, CSS, and multiple files with relative imports. No other npm packages.

### 9.4 Glints (mentor moments)
- Claude calls `flag_mentor_moment` after writing files, providing:
  - **Code and question:** a verbatim snippet (1–6 lines), a short title, and a teaser question that doesn't give the answer away.
  - **Classification:** a category (cleanup, security, performance, accessibility, state, edge-cases, architecture) and a reusable concept name.
  - **Learner links:** `buildsOn` (links to earlier learned concepts, at most 2, with a "why") and `retestOf` (a weak spot it re-tests, if any).
- **Bar for flagging:** decisions a capable mid-level engineer might miss whose reason generalizes. Never trivia, and never things the user asked for. Recognition moments (a learned idea in a new form) are encouraged.
- **Mentor dial:** Off (0 glints; the tool isn't even offered), Subtle (at most 1 per build), Curious (up to 3). Enforced on the server: extra calls are rejected.
- **Display:**
  - The lines glow gold in the editor, with a "✦ why?" pill (purple "★ learned" once learned). Clicking the pill opens the lesson.
  - A chat card shows the teaser, the concept, "↳ builds on …" if linked, and the file. Once learned, it shows the emoji, the rule, and how it was earned.
  - The **Glints tray** in the header lists all glints with an unseen count.
- **Ask-why:** select code and click "✦ Why is it written this way?" to get a lesson about your own selection.
  - Selections over 4,000 characters get "Select a smaller piece to ask why".
  - The selection resets when you switch files.
- After a build, the editor jumps to the first glint's file.

### 9.5 Lessons
- **Choice:** **Let me guess first** (up to +2 ★) or **Tell me** (+1 ★). Ask-why lessons skip the choice.
- **Guessing:** type a hypothesis. Claude returns a verdict (**Nailed it** / **On the right track** / **Not quite**) and one sentence of feedback on what you said.
- **Streaming:** the flashcard fills in as it's written, with a caret. While waiting there's an elapsed timer, and any reasoning summary shows as 💭. First words typically appear in about 2s.
- **Flashcard:** an emoji, a **headline rule** of 9 words or fewer, ✅ a why (25 words max), and 💥 what breaks without it (16 words max). Category colours tint the card.
- **🔗 Builds on what you know:** linked earlier concepts with reasons, each linking to that star on the constellation.
- **Misconception memory:**
  - A partial or missed guess logs the specific gap and shows "📝 Noted: … I'll check back on this in a later build."
  - Nailing a later re-test shows "🌱 You've got it now. Earlier the gap was …" and earns the Comeback badge.
- **A/B experiment ("🔀 What if I hadn't?"):**
  - "Show me the naive way" generates B on demand ("Writing a fair naive version and checking it compiles…").
  - **Honesty rules:** B works in the normal case and fails only the way the lesson says. It may replace a wider region than the glint. It must compile. It comes with an honest **⏳ time to observe** and a **🧪 try this** instruction. If no fair, observable B exists, it says why ("No live demo for this one…").
  - **Server checks:** the replaced region must exist verbatim and include the glint's lines, the swap must change the code, and the swapped file must parse as JSX (`@babel/parser`). One automatic retry with feedback.
  - The card shows A and B side by side and "Swap in B and watch the preview →".
  - **Floating A/B switcher:** while active, toggle A ⇄ B. B's lines highlight red in the editor. "Done · keep A" restores A.
  - **Edits during the test:** edits follow the side being shown, so edits in A are kept. Editing B warns that those edits are discarded when keeping A.
  - The test survives reloads, and ends automatically before a new build or map.
  - If the code changes, "↻ Regenerate B" is offered.
  - Lessons and B generation always read the real code (A), even while B is swapped in.
- **👍/👎 "Good learning?":** a 👎 offers reasons (Too obvious / Confusing / Not accurate / Not useful). Ratings are stored locally and logged on the server.
- **Robustness:**
  - Closing the drawer cancels in-flight requests, and a late answer never overwrites an existing lesson.
  - Lesson text fields are trimmed rather than rejected.
  - Escape closes the drawer.
- **Star burst:** "+N ★", with a note such as "🔗 linked to Timer drift" or "🌱 misconception cleared".

### 9.6 How it works (flow maps)
- **Where:** a "🗺️ How it works" tab beside Preview. A dot on the tab means the map is out of date.
- **Offer:** a chat card ("🗺️ Want to see how this works under the hood? A one-minute walkthrough · +1 ★") after the first build and whenever a build adds new files. Not shown with the mentor Off.
- **Generation:** Claude returns a graph:
  - 5–10 nodes typed as you / handler / state / effect / component / function / storage / browser API, each with a label, a one-line detail, and a code anchor.
  - Labelled edges typed as event / data / render / call.
  - A 4–8 step story and a 💡 takeaway.
  - The server drops invalid nodes, edges and steps.
- **Rendering:** React Flow with a dagre top-to-bottom layout; colour-coded node cards and a legend.
- **Walkthrough:** "▶ Walk me through it":
  - Each step lights up two nodes and sends a dot along the arrow, while the camera zooms to the pair and **the editor highlights the matching code (blue)**.
  - Use ←/→ or the buttons. Arrow keys are ignored while typing in the chat or editor, or while a lesson is open.
  - Finishing earns **+1 ★ (once per project)**.
- **Click any node** to jump to its code.
- **Staleness and errors:**
  - After code changes: "The code changed since this map was drawn · ↻ Update map".
  - Failed updates show the error with a retry.
  - A map that returns after "New project" is discarded.

### 9.7 Debrief
- **Triggers:** the header's 🏁 Wrap up, or a chat card ("🏁 That's every glint from this round") once every glint from the latest build is learned.
- **The card:** a 1200×630 standalone SVG.
  - "I built <project>" (taken from your first prompt), and the date.
  - Stats: concepts learned and stars earned, plus guessed cold, connections and misconceptions cleared when non-zero.
  - Up to 4 learned rules, and a footer with total stars, concepts and the 🔥 day streak.
  - A mini constellation: your whole sky dim, this project's stars bright, links in gold, zoomed to fit.
- **Actions:** Download PNG (2×), Copy image (uses the Safari-compatible clipboard approach, though not yet tested in Safari), Copy text (a shareable summary), Keep building.

### 9.8 Constellation page
- **Header stats:** stars · concepts · connections · 🔥 day streak · badges.
- **Star map:** 7 category clusters.
  - **Every line is a real "builds on" link,** drawn as a glowing arrow from the earlier concept to the later one. Better-connected stars glow bigger, and well-connected stars show labels.
  - **New since your last visit:** new connections draw themselves in, then a dot of light travels from the old star to the new one, which flashes on arrival. The newest stars (up to 5; on a first visit the latest 3) pulse once.
  - **Twinkle:** each star twinkles at its own stable rhythm.
  - **Hover a star** (or a list row) to see a card: emoji and rule, concept and category, **how you earned it** (🎯 guessed cold / 🤔 close guess / 🧭 missed then learned / 📖 asked me to explain / ❓ your own "why?" / 🗺️ walked a flow map), stars, whether it cleared a misconception, what it builds on, the project, and the date. The card clears when you leave the star or tap empty sky.
  - **Click a star** to see its flashcard, **Builds on** and **Led to** lists (clickable), and a replay of pulses along its links.
  - Deep links: `/constellation?focus=<starId>`.
  - All motion is disabled under reduced-motion settings.
- **Concepts learned list:** each concept's rule, a link count and stars.
- **Growth:** misconceptions as "📝 working on it" and "🌱 cleared (was: …)".
- **Badges grid (14):**
  - Milestones: First Light (1★), Stargazer (10★), Navigator (25★), Astronomer (50★).
  - Category badges (3★ in a category; flow stars don't count): Leak Hunter (cleanup), Gatekeeper (security), Speed Demon (performance), Inclusive Builder (accessibility), State Whisperer (state), Edge Case Detective (edge cases), Architect (architecture).
  - Skill badges: Sharp Eye (nail 3 guesses), Cartographer (3 connections), Comeback (clear a misconception).
  - Badge unlocks show an animated toast.

### 9.9 Stars and rewards
| Action | Stars |
|---|---|
| Tell me | +1 |
| Guess: nailed it | +2 |
| Guess: partial or miss (then learn) | +1 |
| Ask-why on your own selection | +1 |
| Finish a flow walkthrough | +1 (once per project) |

Each glint can earn stars only once.

---

## 10. Architecture

```
Browser (Next.js App Router, React 19, client-only workspace)
 ├─ Chat + build progress ── POST /api/build    (NDJSON stream)
 ├─ Sandpack editor + preview (in-browser bundling; CodeMirror extensions for highlights)
 ├─ Lesson drawer ────────── POST /api/lesson   (NDJSON stream of structured output)
 │                       └── POST /api/ab       (fair B, server-checked)
 ├─ Flow map ─────────────── POST /api/flow     (structured graph)
 ├─ Ratings ──────────────── POST /api/feedback (server log)
 └─ zustand stores persisted to localStorage (workspace v4, progress v3)

Vercel serverless (Node runtime)
 ├─ middleware.ts: access-code gate
 ├─ lib/rateLimit.ts: per-IP limits (Upstash if configured, else in-memory)
 └─ Anthropic SDK (beta messages, server-side refusal fallbacks)
```

### Claude usage
| Route | What it does | Output | Effort | Thinking display | Timeout |
|---|---|---|---|---|---|
| `/api/build` | Streaming tool loop (up to 8 rounds): `write_file` (eager input streaming), `flag_mentor_moment` | NDJSON events: status, thought, text, file_progress, file_done, glint, error, done | medium | summarized (streamed as status) | 300s |
| `/api/lesson` | Flashcard plus guess grading, misconception gap, links (ask-why) | Structured output (Zod), streamed | low | summarized | 60s |
| `/api/ab` | Fair naive B: region, replacement, what changed, ⏳ minutes, 🧪 try it | Structured output, checked on the server, 1 retry | medium | none | 120s |
| `/api/flow` | Data-flow graph and story | Structured output, sanitized | medium | none | 120s |

- **Model:** `claude-opus-5-5` everywhere, with `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). Refusals are handled gracefully.
- **Caching:** the build system prompt is marked for caching. Per-request context (history, files, mentor mode, learner profile) lives in the user turn.
- **Learner profile:** sent with each build (and ask-why lessons). Up to 40 learned concepts (refs `L1…`) and 10 open weak spots (refs `W1…`), using short refs so internal ids never reach the model. The server drops unknown refs, dedupes links, and trims long text instead of rejecting it.

### Limits
- **Rate limits (per IP, per 10 minutes):** 20 builds, 60 lessons (shared with A/B), 30 flow maps, 120 feedback.
- **Request limits:** prompt 4,000 characters; history 20 turns × 4,000 characters (the client sends 10); project under 200 KB; snippet 4,000 characters; file paths must match `/^\/[\w\-./]+$/`.
- **Glint fields** are capped on arrival: title 120, teaser 400, concept 80, link reason 160.

### Data model (localStorage)
- **`constellation-workspace` (v4):** files, active file, chat messages (text, files, glint ids, error, note, offer flags), glints (snippet, teaser, category, concept, links, retestId, lesson, the B variant and status), mentor mode, A/B test state, saved flow map (with a hash of the code), and project id and start time.
- **`constellation-progress` (v3):** stars (concept, category, lesson, verdict, source, links, project id and name, earned time), badges, ratings, misconceptions (gap, guess, status, attempts, cleared by).
- **`constellation-last-visit`:** a timestamp for "new since last visit".
- **Migrations:** v1 → v2 (long-form lessons become flashcards), v3 (unfair inline B variants dropped), v4 (links, re-tests, project ids).

### Key files
| Area | Files |
|---|---|
| Claude prompts, tools, schemas | `lib/claude.ts` |
| API routes | `app/api/{build,lesson,ab,flow,feedback,access}/route.ts` |
| Shared types | `lib/types.ts` |
| Stores | `lib/workspace.ts`, `lib/progress.ts`, `lib/buildProgress.ts` |
| Learner profile (server) | `lib/learnerProfile.ts` |
| Editor sync, highlights, layout | `components/CodePane.tsx`, `components/glintExtension.ts`, `components/Workspace.tsx`, `components/useLayoutMode.ts` |
| Build client | `components/useBuild.ts`, `components/BuildProgress.tsx`, `components/ChatPanel.tsx` |
| Lessons, A/B | `components/LessonDrawer.tsx`, `components/AbBar.tsx`, `lib/ab.ts` |
| Flow maps | `components/FlowView.tsx`, `components/FlowOfferCard.tsx` |
| Constellation, debrief | `components/ConstellationView.tsx`, `lib/constellationLayout.ts`, `components/Debrief.tsx`, `lib/debrief.ts` |

**Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, Sandpack, CodeMirror 6, React Flow and dagre, framer-motion, zustand, zod, `@anthropic-ai/sdk`, `@babel/parser`, Upstash (optional).

### Deployment
- Vercel project connected to the GitHub repo: a push to `main` deploys to production, and other branches get preview URLs.
- **Environment:** `ANTHROPIC_API_KEY` (required), `ACCESS_CODE` (recommended), `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (optional, for shared rate limits).

---

## 11. Known limitations and next steps
- **No accounts:** progress is per browser, with no cross-device sync and no leaderboard yet.
- **Rate limits:** per serverless instance unless Upstash is configured.
- **Front-end only:** builds are limited to React, JavaScript and CSS in the browser, with no backend code execution.
- **Sparse links:** links are deliberately sparse (only real connections), so some sessions add no lines.
- **Long A/B waits:** some A/B failures take minutes to observe (shown honestly), and some have no fair live demo.
- **Older stars:** stars from before project tagging have no project name and don't count in a project's debrief.
- **Unstyled apps:** an app that sets no page background renders on the dark preview frame.
- **Next steps:**
  - Accounts and sync.
  - Spaced-repetition reviews of learned rules.
  - An expanded flow-map mode.
  - Eval suites for glint quality and A/B fairness.
  - Prompt tuning from 👍/👎 and misconception-clearance data.
  - Team or classroom mode.
  - IDE and Claude Code integrations reusing the lesson, A/B and flow APIs.
