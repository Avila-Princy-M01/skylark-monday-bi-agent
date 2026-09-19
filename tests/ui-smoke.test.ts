import { describe, it, expect } from "vitest";
import { POST } from "../app/api/chat/route";
import { NextRequest } from "next/server";

describe("UI & API Route Integration Suite", () => {
  it("rejects empty JSON payloads on /api/chat with HTTP 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ query: "   " }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Query cannot be empty.");
  });

  it("handles valid queries on /api/chat and streams SSE events", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ query: "What is our open pipeline?" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    let chunks = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks += new TextDecoder().decode(value);
      }
    }

    expect(chunks).toContain("event: data-source");
    expect(chunks).toContain("event: trace");
    expect(chunks).toContain("event: final");
  });

  it("streams clarification chips on ambiguous queries", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ query: "revenue" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    let chunks = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks += new TextDecoder().decode(value);
      }
    }

    expect(chunks).toContain("event: final");
    expect(chunks).toContain("clarifyingVerdict");
  });
});
