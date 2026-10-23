import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ACCESS_COOKIE } from "@/lib/access";

export async function POST(req: Request) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return NextResponse.json({ ok: true });

  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  const given = Buffer.from(typeof code === "string" ? code : "");
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ ok: false, error: "That code doesn't match." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function GET() {
  return NextResponse.json({ required: Boolean(process.env.ACCESS_CODE) });
}
