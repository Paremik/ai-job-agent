import { createHash, createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto";

const cookieName = "job_agent_session";
const ttlSeconds = 30 * 24 * 60 * 60;
const site = "https://ai-job-agent-sync.quirkywave2048.chatgpt.site";
const attemptWindowMs = 10 * 60 * 1000;
const maxAttempts = 12;
const attempts = new Map();
function clientId(req) {
  const header = req.headers["x-vercel-forwarded-for"] ?? req.headers["x-forwarded-for"];
  const value = Array.isArray(header) ? header[0] : (header ?? "unknown");
  return value.split(",")[0].trim().slice(0, 64);
}
function failedAttempts(id, now = Date.now()) {
  const current = attempts.get(id);
  if (!current || now - current.since >= attemptWindowMs) return 0;
  return current.count;
}
function recordFailure(id, now = Date.now()) {
  if (attempts.size > 5000) {
    for (const [key, value] of attempts)
      if (now - value.since >= attemptWindowMs) attempts.delete(key);
    if (attempts.size > 5000) attempts.delete(attempts.keys().next().value);
  }
  const current = attempts.get(id);
  attempts.set(
    id,
    !current || now - current.since >= attemptWindowMs
      ? { since: now, count: 1 }
      : { since: current.since, count: current.count + 1 },
  );
}
function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}
const equal = (a, b) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const signature = (expires) =>
  createHmac("sha256", process.env.PANEL_SESSION_KEY ?? "")
    .update(String(expires))
    .digest("base64url");
function signedIn(req) {
  if (!process.env.PANEL_SESSION_KEY) return false;
  const value = (req.headers.cookie ?? "")
    .split("; ")
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!value) return false;
  const [expires, mac] = value.split(".");
  if (!/^\d+$/.test(expires ?? "") || !mac || Number(expires) < Date.now()) return false;
  return equal(signature(expires), mac);
}
function page(error = "") {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вход · Job Agent</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eaf0e8;color:#143a2c;font:16px/1.5 system-ui,Arial,sans-serif;padding:20px}
  main{width:min(100%,420px);background:#fff;border:1px solid #dce6d8;border-radius:24px;padding:32px;box-shadow:0 20px 55px #193a2830}
  .brand{font-weight:800;color:#20583d;letter-spacing:.04em}h1{font-size:28px;line-height:1.15;margin:22px 0 9px}p{color:#52675b;margin:0 0 25px}
  label{display:block;font-weight:650;margin-bottom:9px}input{width:100%;padding:14px 16px;border:1px solid #aebfad;border-radius:12px;font:inherit}
  input:focus{outline:3px solid #c8e9b6;border-color:#2c7a4d}button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;background:#1c5b3e;color:#fff;font:inherit;font-weight:750;cursor:pointer}
  .error{color:#a32728;margin-top:15px;font-weight:650}</style></head><body><main><div class="brand">✦ JOB AGENT</div><h1>Вход в панель</h1><p>Вакансии и журнал откликов на компьютере и телефоне.</p><form method="post" action="/login"><label for="password">Пароль панели</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Открыть панель</button></form>${error ? `<div class="error" role="alert">${error}</div>` : ""}</main></body></html>`;
}
function reply(res, status, body, type = "text/html; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  securityHeaders(res);
  if (type.startsWith("text/html"))
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; style-src 'unsafe-inline'",
    );
  res.end(body);
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw Error("Request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function validPassword(input) {
  const [saltHex, hashHex] = (process.env.PANEL_PASSWORD_HASH ?? "").split(":");
  if (!saltHex || !hashHex || !input) return false;
  const hash = pbkdf2Sync(input, Buffer.from(saltHex, "hex"), 210000, 32, "sha256");
  return equal(hash.toString("hex").toUpperCase(), hashHex.toUpperCase());
}
async function proxy(req, res, path, search) {
  if (!process.env.SITE_BYPASS_TOKEN || !process.env.PANEL_SERVICE_KEY)
    return reply(res, 503, "Панель временно недоступна");
  const target = new URL("/" + path.replace(/^\/+/, ""), site);
  if (target.origin !== site) return reply(res, 400, "Некорректный адрес");
  for (const [key, value] of search) if (key !== "path") target.searchParams.append(key, value);
  const headers = {
    "OAI-Sites-Authorization": `Bearer ${process.env.SITE_BYPASS_TOKEN}`,
    "x-panel-service-key": process.env.PANEL_SERVICE_KEY,
    Origin: site,
    Accept: req.headers.accept ?? "*/*",
  };
  if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
  const payload = req.method === "POST" || req.method === "PUT" ? await body(req) : undefined;
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: payload,
    redirect: "manual",
  });
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("location");
    if (!location) return reply(res, 502, "Ошибка перенаправления");
    const next = new URL(location, target);
    if (next.origin !== site) return reply(res, 502, "Ошибка перенаправления");
    res.statusCode = 302;
    res.setHeader("Location", next.pathname + next.search);
    res.end();
    return;
  }
  res.statusCode = upstream.status;
  for (const key of ["content-type", "content-disposition", "content-security-policy"]) {
    const value = upstream.headers.get(key);
    if (value) res.setHeader(key, value);
  }
  res.setHeader("Cache-Control", "no-store");
  securityHeaders(res);
  let content = Buffer.from(await upstream.arrayBuffer());
  if (path === "classic" && upstream.headers.get("content-type")?.includes("text/html")) {
    const html = content
      .toString("utf8")
      .replace(
        "</nav>",
        '</nav><a href="/logout" style="display:block;margin:20px 24px 8px;color:#e8f3e7;font-weight:700;text-decoration:underline">Выйти из панели</a>',
      );
    const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
    if (!script) return reply(res, 502, "Ошибка загрузки панели");
    const hash = createHash("sha256").update(script.replace(/\r\n?/g, "\n")).digest("base64");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; ` +
        `script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:`,
    );
    content = Buffer.from(html, "utf8");
  }
  res.end(content);
}
export default async function handler(req, res) {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.searchParams.get("path") ?? url.pathname.slice(1);
    if (path === "login" && req.method === "POST") {
      const origin = req.headers.origin;
      if (origin && origin !== `https://${req.headers.host}`) return reply(res, 403, "Недоступно");
      const id = clientId(req);
      if (failedAttempts(id) >= maxAttempts) {
        res.setHeader("Retry-After", "600");
        return reply(res, 429, page("Слишком много попыток. Попробуйте через 10 минут."));
      }
      const form = new URLSearchParams((await body(req)).toString("utf8"));
      if (!validPassword(form.get("password"))) {
        recordFailure(id);
        return reply(res, 401, page("Неверный пароль"));
      }
      attempts.delete(id);
      const expires = Date.now() + ttlSeconds * 1000;
      res.statusCode = 303;
      res.setHeader("Location", "/classic");
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=${expires}.${signature(expires)}; Path=/; Max-Age=${ttlSeconds}; HttpOnly; Secure; SameSite=Lax`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.end();
      return;
    }
    if (path === "logout") {
      res.statusCode = 303;
      res.setHeader("Location", "/");
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      );
      res.end();
      return;
    }
    if (!signedIn(req)) {
      if (
        req.method !== "GET" ||
        path.startsWith("api/") ||
        path.startsWith("application-drafts/") ||
        path.startsWith("applications/")
      )
        return reply(
          res,
          401,
          JSON.stringify({ error: "Требуется вход" }),
          "application/json; charset=utf-8",
        );
      return reply(res, 200, page());
    }
    if (path === "" || path === "api/entry") {
      res.statusCode = 302;
      res.setHeader("Location", "/classic");
      res.end();
      return;
    }
    if (!["GET", "POST", "PUT"].includes(req.method)) return reply(res, 405, "Method not allowed");
    await proxy(req, res, path, url.searchParams);
  } catch (error) {
    console.error("Panel proxy error", error instanceof Error ? error.message : "Unknown");
    if (!res.headersSent) reply(res, 502, "Панель временно недоступна");
    else res.end();
  }
}
