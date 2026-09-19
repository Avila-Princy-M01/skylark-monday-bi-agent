import http from "http";
import https from "https";

const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL || "http://localhost:3000";

async function fetchUrl(urlStr: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === "https:" ? https : http;

    const req = client.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ statusCode: res.statusCode || 0, body: data });
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error(`Timeout requesting ${urlStr}`));
    });
  });
}

interface HealthPayload {
  status?: string;
  service?: string;
  timestamp?: string;
  environment?: {
    configured?: Record<string, boolean>;
    cacheTtlSeconds?: number;
    dataSource?: string;
  };
}

async function runSmokeTests() {
  console.log(`[SMOKE TEST] Verifying deployment target at: ${DEPLOYMENT_URL}`);
  let failed = false;

  // 1. Verify Homepage / UI
  try {
    const homeRes = await fetchUrl(`${DEPLOYMENT_URL}/`);
    if (homeRes.statusCode >= 200 && homeRes.statusCode < 400) {
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
    const healthRes = await fetchUrl(`${DEPLOYMENT_URL}/api/health`);
    if (healthRes.statusCode !== 200) {
      console.error(
        `[SMOKE TEST] ❌ GET /api/health returned non-200 status: ${healthRes.statusCode}`
      );
      failed = true;
    } else {
      let payload: HealthPayload;
      try {
        payload = JSON.parse(healthRes.body) as HealthPayload;
      } catch {
        console.error(`[SMOKE TEST] ❌ /api/health response is not valid JSON`);
        failed = true;
        process.exit(1);
      }

      // Assert critical health contract fields
      if (payload.status !== "healthy") {
        console.error(
          `[SMOKE TEST] ❌ /api/health status field is not 'healthy' (found: '${payload.status}')`
        );
        failed = true;
      }

      if (!payload.environment || typeof payload.environment.configured !== "object") {
        console.error(`[SMOKE TEST] ❌ /api/health missing environment.configured object`);
        failed = true;
      }

      console.log(
        `[SMOKE TEST] ✅ GET /api/health passed content assertions:`,
        JSON.stringify(payload, null, 2)
      );
    }
  } catch (err) {
    console.error(`[SMOKE TEST] ❌ Failed to connect to /api/health:`, err);
    failed = true;
  }

  if (failed) {
    console.error(`[SMOKE TEST] 🚨 Smoke test failed! Marking deployment unhealthy.`);
    process.exit(1);
  }

  console.log(`[SMOKE TEST] 🎉 Deployment verified and healthy!`);
}

runSmokeTests();
