export const ACCESS_COOKIE = "constellation_access";

/**
 * The cookie holds a signed token, never the access code itself: an HMAC of the
 * code keyed by a server-only secret. Knowing the code (or this source) isn't
 * enough to forge it, so guessing has to go through the rate-limited
 * /api/access route. Works in both the Edge middleware and Node routes (Web Crypto).
 *
 * The key is ACCESS_SECRET if set, otherwise the server's Anthropic key. Rotating
 * either one signs everyone out.
 */
export async function accessToken(code: string): Promise<string> {
  const secret = process.env.ACCESS_SECRET || process.env.ANTHROPIC_API_KEY || "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`constellation-access:v1:${code}`));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Constant-time string comparison (no early exit on the first differing character). */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
