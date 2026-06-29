import { NextResponse, type NextRequest } from "next/server";

// Observability: tag every API request with a trace id and emit a structured
// access log. Runs before route handlers (Next.js 16 "proxy" convention).
export function proxy(request: NextRequest) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();

  const res = NextResponse.next();
  res.headers.set("x-request-id", requestId);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "request",
      reqId: requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      ts: new Date().toISOString(),
    }),
  );

  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
