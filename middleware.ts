import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/security/rate-limiter";
import { getClientIp, isPayloadTooLarge, verifySameOrigin } from "@/lib/security/guard";

export const config = {
  matcher: ["/api/:path*"],
};

export async function middleware(req: NextRequest) {
  try {
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

    // 2. CSRF / Origin check on state-modifying endpoints like /api/resync
    if (req.method === "POST" && pathname === "/api/resync") {
      if (!verifySameOrigin(req)) {
        return NextResponse.json(
          {
            error: "Cross-site request forgery attempt blocked. Request origin not allowed.",
            code: "CSRF_BLOCKED",
          },
          {
            status: 403,
            headers: {
              "X-Content-Type-Options": "nosniff",
              "X-Frame-Options": "DENY",
            },
          }
        );
      }
    }

    // 3. Client identification & sliding-window rate evaluation (distributed or in-memory)
    const response = NextResponse.next();
    try {
      const clientIp = getClientIp(req);
      const rateLimit = await checkRateLimitAsync(clientIp, pathname);

      // 4. Reject if rate limit exceeded
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
              "X-RateLimit-Source": rateLimit.source,
              "X-Content-Type-Options": "nosniff",
              "X-Frame-Options": "DENY",
            },
          }
        );
      }

      response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
      response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
      response.headers.set("X-RateLimit-Reset", String(rateLimit.resetInSeconds));
      response.headers.set("X-RateLimit-Source", rateLimit.source);
    } catch (err) {
      console.warn("[Middleware] Rate limiting check failed, failing open safely:", err);
    }

    // Defense-in-depth security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("X-XSS-Protection", "1; mode=block");

    return response;
  } catch (fatalErr) {
    console.warn("[Middleware] Fatal error in edge middleware, failing open:", fatalErr);
    return NextResponse.next();
  }
}
