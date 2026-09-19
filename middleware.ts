import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { getClientIp, isPayloadTooLarge } from "@/lib/security/guard";

export const config = {
  matcher: ["/api/:path*"],
};

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 1. Enforce payload size limits before compute/body parsing
  if (isPayloadTooLarge(req)) {
    return NextResponse.json(
      {
        error: "Payload too large. Maximum allowed request size is 16 KB.",
        code: "PAYLOAD_TOO_LARGE",
      },
      {
        status: 413,
        headers: {
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
        },
      }
    );
  }

  // 2. Client identification & sliding-window rate evaluation
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, pathname);

  // 3. Reject if rate limit exceeded
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Please throttle your requests.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterSeconds: rateLimit.resetInSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.resetInSeconds),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimit.resetInSeconds),
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
        },
      }
    );
  }

  // 4. Continue with rate-limit and defensive security headers attached
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
  response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  response.headers.set("X-RateLimit-Reset", String(rateLimit.resetInSeconds));

  // Defense-in-depth security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}
