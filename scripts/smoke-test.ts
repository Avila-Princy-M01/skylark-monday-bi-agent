const DEPLOYMENT_URL = (process.env.DEPLOYMENT_URL || "http://localhost:3000").replace(/\/+$/, "");
const BYPASS_SECRET =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS || "";

interface FetchResult {
  statusCode: number;
  body: string;
  location?: string;
  isVercelAuthRedirect: boolean;
  contentType?: string;
}

async function fetchEndpoint(path: string): Promise<FetchResult> {
  const url = `${DEPLOYMENT_URL}${path}`;
  const headers: Record<string, string> = {};

  if (BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = BYPASS_SECRET;
    headers["x-vercel-set-bypass-cookie"] = "true";
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });

  const location = res.headers.get("location") || undefined;
  const contentType = res.headers.get("content-type") || undefined;
  const body = await res.text();

  const isVercelAuthRedirect =
    res.status === 302 &&
    Boolean(
      location &&
      (location.includes("vercel.com/sso-api") ||
        location.includes("vercel.com/login") ||
        location.includes("vercel.live"))
    );

  return {
    statusCode: res.status,
    body,
    location,
    isVercelAuthRedirect,
    contentType,
  };
}

interface HealthPayload {
  status?: "healthy" | "degraded" | "misconfigured";
  service?: string;
  timestamp?: string;
  diagnostics?: {
    monday?: { configured: boolean; dataSource: string };
    llm?: { configured: boolean };
    cache?: { ttlSeconds: number };
  };
  issues?: string[];
}

async function runSmokeTests() {
  console.log(`[SMOKE TEST] Verifying deployment target at: ${DEPLOYMENT_URL}`);
  let failed = false;

  // 1. Verify Homepage / UI Gateway
  try {
    const homeRes = await fetchEndpoint("/");
    if (homeRes.isVercelAuthRedirect) {
      console.log(
        `[SMOKE TEST] ℹ️ Vercel Deployment Protection is active on GET / (Redirect to SSO: ${homeRes.location})`
      );
    } else if (homeRes.statusCode >= 200 && homeRes.statusCode < 400) {
      console.log(`[SMOKE TEST] ✅ GET / returned HTTP ${homeRes.statusCode}`);
    } else {
      console.error(`[SMOKE TEST] ❌ GET / failed with HTTP ${homeRes.statusCode}`);
      failed = true;
    }
  } catch (err) {
    console.error(`[SMOKE TEST] ❌ Failed to reach GET /:`, err);
    failed = true;
  }

  // 2. Deep Health Verification (/api/health)
  try {
    const healthRes = await fetchEndpoint("/api/health");

    if (healthRes.isVercelAuthRedirect) {
      console.log(
        `[SMOKE TEST] ℹ️ Vercel Deployment Protection (SSO) intercepted /api/health (HTTP 302 -> SSO). Deployment is live behind authentication gateway.`
      );
    } else {
      let payload: HealthPayload;
      try {
        payload = JSON.parse(healthRes.body) as HealthPayload;
      } catch {
        console.error(
          `[SMOKE TEST] ❌ /api/health response (HTTP ${healthRes.statusCode}, Content-Type: ${healthRes.contentType}) is not valid JSON:\n${healthRes.body.slice(0, 300)}`
        );
        process.exit(1);
      }

      if (payload.status === "misconfigured" || healthRes.statusCode === 503) {
        console.error(
          `[SMOKE TEST] ❌ Deployment is misconfigured:`,
          payload.issues?.join("; ") || "Missing critical credentials"
        );
        failed = true;
      } else if (payload.status === "degraded") {
        console.warn(
          `[SMOKE TEST] ⚠️ Deployment running in degraded mode:`,
          payload.issues?.join("; ")
        );
      } else if (payload.status === "healthy") {
        console.log(
          `[SMOKE TEST] ✅ GET /api/health reported system is fully healthy:`,
          JSON.stringify(payload.diagnostics, null, 2)
        );
      } else {
        console.error(`[SMOKE TEST] ❌ Unknown health status received:`, payload.status);
        failed = true;
      }
    }
  } catch (err) {
    console.error(`[SMOKE TEST] ❌ Failed to connect to /api/health:`, err);
    failed = true;
  }

  if (failed) {
    console.error(`[SMOKE TEST] 🚨 Smoke test failed! Marking deployment unhealthy.`);
    process.exit(1);
  }

  console.log(`[SMOKE TEST] 🎉 Smoke test completed successfully!`);
}

runSmokeTests();
