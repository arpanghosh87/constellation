import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Limit = { requests: number; windowSec: number };

const LIMITS = {
  build: { requests: 20, windowSec: 600 },
  lesson: { requests: 60, windowSec: 600 },
  feedback: { requests: 120, windowSec: 600 },
  flow: { requests: 30, windowSec: 600 },
  access: { requests: 10, windowSec: 600 },
} satisfies Record<string, Limit>;

type Bucket = keyof typeof LIMITS;

const upstashConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

const upstash: Partial<Record<Bucket, Ratelimit>> = {};
function getUpstash(bucket: Bucket) {
  const { requests, windowSec } = LIMITS[bucket];
  upstash[bucket] ??= new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(requests, `${windowSec} s`),
    prefix: `constellation:${bucket}`,
  });
  return upstash[bucket];
}

// Fallback when Upstash isn't configured: per-instance memory. Good enough
// locally; on Vercel each serverless instance keeps its own counts.
const memory = new Map<string, number[]>();

export async function checkRateLimit(bucket: Bucket, ip: string): Promise<boolean> {
  if (upstashConfigured) {
    const { success } = await getUpstash(bucket).limit(ip);
    return success;
  }
  const { requests, windowSec } = LIMITS[bucket];
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= requests) {
    memory.set(key, hits);
    return false;
  }
  hits.push(now);
  memory.set(key, hits);
  return true;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
