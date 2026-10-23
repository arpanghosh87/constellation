import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE } from "@/lib/access";

// When ACCESS_CODE is unset (local dev) the gate is disabled.
export function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();
  if (req.cookies.get(ACCESS_COOKIE)?.value === code) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Access code required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("locked", "1");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/build/:path*", "/constellation/:path*", "/api/build", "/api/lesson", "/api/feedback", "/api/flow", "/api/ab"],
};
