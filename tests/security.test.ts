import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clearRateLimits, getRuleForPath } from "@/lib/security/rate-limiter";
import {
  isPayloadTooLarge,
  isAuthorizedAdmin,
  acquireResyncLock,
  releaseResyncLock,
  MAX_BODY_SIZE_BYTES,
} from "@/lib/security/guard";
import { NextRequest } from "next/server";

describe("Enterprise In-App Security & Rate Limiting", () => {
  beforeEach(() => {
    clearRateLimits();
    releaseResyncLock();
    delete process.env.ADMIN_API_KEY;
    delete process.env.STRICT_AUTH_MODE;
  });

  describe("Sliding-Window Rate Limiter", () => {
    it("resolves route-specific limits correctly", () => {
      expect(getRuleForPath("/api/chat").max).toBe(10);
      expect(getRuleForPath("/api/brief").max).toBe(5);
      expect(getRuleForPath("/api/resync").max).toBe(2);
      expect(getRuleForPath("/api/health").max).toBe(60);
      expect(getRuleForPath("/api/unknown").max).toBe(30);
    });

    it("allows requests up to the route boundary and throttles on overflow", () => {
      const ip = "192.168.1.100";
      const path = "/api/resync"; // limit: 2
      const now = 1000000;

      // Request 1: Allowed
      const r1 = checkRateLimit(ip, path, now);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(1);

      // Request 2: Allowed
      const r2 = checkRateLimit(ip, path, now + 1000);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(0);

      // Request 3: Throttled
      const r3 = checkRateLimit(ip, path, now + 2000);
      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.resetInSeconds).toBeGreaterThan(0);
    });

    it("isolates client quotas so one IP does not throttle another", () => {
      const ip1 = "10.0.0.1";
      const ip2 = "10.0.0.2";
      const path = "/api/brief"; // limit: 5
      const now = 1000000;

      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(ip1, path, now).allowed).toBe(true);
      }
      // ip1 is exhausted
      expect(checkRateLimit(ip1, path, now).allowed).toBe(false);

      // ip2 is completely fresh and allowed
      const ip2Result = checkRateLimit(ip2, path, now);
      expect(ip2Result.allowed).toBe(true);
      expect(ip2Result.remaining).toBe(4);
    });

    it("replenishes allowance after the sliding window expires", () => {
      const ip = "192.168.1.50";
      const path = "/api/chat"; // limit: 10, window: 60s
      const t0 = 1000000;

      for (let i = 0; i < 10; i++) {
        checkRateLimit(ip, path, t0);
      }
      expect(checkRateLimit(ip, path, t0).allowed).toBe(false);

      // After 61 seconds (61000 ms), window has rolled over
      const t1 = t0 + 61000;
      const refreshed = checkRateLimit(ip, path, t1);
      expect(refreshed.allowed).toBe(true);
      expect(refreshed.remaining).toBe(9);
    });
  });

  describe("Request Payload & Size Guard", () => {
    it("flags payloads larger than 16 KB", () => {
      const smallReq = new NextRequest("http://localhost/api/chat", {
        headers: { "content-length": "1024" },
      });
      expect(isPayloadTooLarge(smallReq)).toBe(false);

      const largeReq = new NextRequest("http://localhost/api/chat", {
        headers: { "content-length": String(MAX_BODY_SIZE_BYTES + 1) },
      });
      expect(isPayloadTooLarge(largeReq)).toBe(true);
    });
  });

  describe("Administrative Authorization Guard", () => {
    it("authorizes requests matching ADMIN_API_KEY via Bearer or custom header", () => {
      process.env.ADMIN_API_KEY = "super-secret-key-123";

      const unauthedReq = new NextRequest("http://localhost/api/resync");
      expect(isAuthorizedAdmin(unauthedReq)).toBe(false);

      const bearerReq = new NextRequest("http://localhost/api/resync", {
        headers: { authorization: "Bearer super-secret-key-123" },
      });
      expect(isAuthorizedAdmin(bearerReq)).toBe(true);

      const customHeaderReq = new NextRequest("http://localhost/api/resync", {
        headers: { "x-admin-key": "super-secret-key-123" },
      });
      expect(isAuthorizedAdmin(customHeaderReq)).toBe(true);
    });
  });

  describe("Resync Concurrency Lock", () => {
    it("prevents parallel concurrent execution and permits execution once released", () => {
      expect(acquireResyncLock()).toBe(true);
      // Attempting to acquire again while held fails
      expect(acquireResyncLock()).toBe(false);

      releaseResyncLock();
      // After release, acquisition succeeds
      expect(acquireResyncLock()).toBe(true);
      releaseResyncLock();
    });
  });
});
