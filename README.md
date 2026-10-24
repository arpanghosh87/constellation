# ✦ Constellation

A vibe-coding workspace where Claude builds your app and quietly points out the engineering decisions worth understanding. Catch a "glint", learn why, earn stars and badges.

## Run locally

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY (or export it in your shell)
npm install
npm run dev                  # http://localhost:3000
```

## How it works

- **`/api/build`**: streaming tool loop on `claude-opus-5-5`. Claude calls `write_file` (streamed live into the Sandpack editor via eager input streaming) and `flag_mentor_moment` (a "glint": a verbatim snippet, a teaser question, and a category). The server re-emits typed NDJSON events (`lib/types.ts` → `BuildEvent`).
- **`/api/lesson`**: structured-output lesson (`lessonSchema` in `lib/claude.ts`). It optionally grades the user's guess (`nailed` = +2★, otherwise +1★).
- **Progress**: stars and badges live in localStorage (`lib/progress.ts`, `lib/badges.ts`). Each glint can award stars only once.
- **Editor highlights**: a CodeMirror extension (`components/glintExtension.ts`) decorates glint lines and adds the "✦ why?" pill. Selecting code shows "Why is it written this way?" for user-initiated lessons.

## Deploy (Vercel)

The Vercel project is connected to this repo: every push to `main` deploys to production, and other branches get preview URLs.

Set the env vars from `.env.example` in the Vercel project settings:

- `ANTHROPIC_API_KEY`: required.
- `ACCESS_CODE`: recommended on a public URL. Visitors enter it once; the cookie holds a signed token, not the code.
- `ACCESS_SECRET`: optional key for signing that cookie (defaults to `ANTHROPIC_API_KEY`).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: optional, for shared per-IP rate limits (20 builds and 60 lessons per 10 minutes). Without them, limits are per serverless instance.

`/api/build` uses `maxDuration = 300`; builds typically take 30–60s.

## License

MIT. See [LICENSE](LICENSE).

