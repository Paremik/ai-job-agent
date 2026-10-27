import assert from "node:assert/strict";
import { createHash, pbkdf2Sync } from "node:crypto";
import { Readable } from "node:stream";
import { test } from "vitest";
import handler from "./entry.js";

const salt = "0123456789abcdef0123456789abcdef";
process.env.PANEL_PASSWORD_HASH = `${salt}:${pbkdf2Sync("test-password", Buffer.from(salt, "hex"), 210000, 32, "sha256").toString("hex")}`;
process.env.PANEL_SESSION_KEY = "test-session-key";
process.env.SITE_BYPASS_TOKEN = "test-bypass-token";
process.env.PANEL_SERVICE_KEY = "test-service-key";

async function request(method, path, body = "", headers = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = path;
  req.headers = { host: "ai-job-agent-panel.vercel.app", ...headers };
  const values = new Map();
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) { values.set(name.toLowerCase(), value); },
    end(content = "") { this.headersSent = true; this.body = String(content); },
  };
  await handler(req, res);
  return { status: res.statusCode, headers: values, body: res.body };
}

test("private data is unavailable without a session", async () => {
  const result = await request("GET", "/?path=api/classic/reviews");
  assert.equal(result.status, 401);
  assert.doesNotMatch(result.body, /test-service-key/);
});

test("repeated wrong passwords are throttled per client", async () => {
  const headers = { "x-vercel-forwarded-for": "192.0.2.10", origin: "https://ai-job-agent-panel.vercel.app" };
  for (let i = 0; i < 12; i++) {
    const result = await request("POST", "/?path=login", "password=wrong", headers);
    assert.equal(result.status, 401);
  }
  const blocked = await request("POST", "/?path=login", "password=test-password", headers);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "600");
});

test("signed-in dashboard permits its script and blocks other scripts", async () => {
  const headers = { "x-vercel-forwarded-for": "192.0.2.11", origin: "https://ai-job-agent-panel.vercel.app" };
  const login = await request("POST", "/?path=login", "password=test-password", headers);
  assert.equal(login.status, 303);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const script = "\r\ndocument.body.dataset.loaded = 'yes'\r\n";
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<html><nav></nav><script>${script}</script></html>`,
    { headers: { "content-type": "text/html" } });
  try {
    const dashboard = await request("GET", "/?path=classic", "", { cookie });
    assert.equal(dashboard.status, 200);
    const expectedHash = createHash("sha256").update(script.replace(/\r\n?/g, "\n")).digest("base64");
    assert.match(dashboard.headers.get("content-security-policy"),
      new RegExp(`script-src 'sha256-${expectedHash.replace(/[+/=]/g, "\\$&")}'`));
    assert.equal(dashboard.headers.get("x-frame-options"), "DENY");
    assert.match(dashboard.body, /Выйти из панели/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
