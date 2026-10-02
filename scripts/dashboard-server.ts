import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ReviewChange, ReviewStore, updateReviewStore } from "../src/dashboard/review-store.js";
import { BriefRequest, buildApplicationBrief } from "../src/dashboard/application-brief.js";
import {
  ApplicantContact,
  DraftUpdate,
  LocalDraft,
  buildLocalDraft,
} from "../src/dashboard/local-draft.js";
import { buildDashboard } from "./build-dashboard.js";

const privateFolder = new URL("../private/", import.meta.url);
const storePath = new URL("dashboard-reviews.json", privateFolder);
const draftsFolder = new URL("local-drafts/", privateFolder);
const port = Number(process.env.DASHBOARD_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid dashboard port");
const origin = `http://127.0.0.1:${port}`;
let pendingWrite: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<ReviewStore> {
  try {
    return ReviewStore.parse(JSON.parse(await readFile(storePath, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return { version: 1, records: [] };
    throw error;
  }
}

async function saveStore(store: ReviewStore): Promise<void> {
  const temporary = new URL(`dashboard-reviews-${randomUUID()}.tmp`, privateFolder);
  await writeFile(temporary, JSON.stringify(store, null, 2) + "\n", { flag: "wx" });
  await rename(temporary, storePath);
}

function json(response: ServerResponse, code: number, value: unknown): void {
  response.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage, limit = 16_384): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > limit) throw new Error("Request too large");
  }
  return JSON.parse(body);
}

function draftPath(jobId: string): URL {
  return new URL(`${jobId}.json`, draftsFolder);
}

async function readDraft(jobId: string): Promise<LocalDraft | null> {
  try {
    return LocalDraft.parse(JSON.parse(await readFile(draftPath(jobId), "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}

async function saveDraft(draft: LocalDraft): Promise<void> {
  await mkdir(draftsFolder, { recursive: true });
  const temporary = new URL(`${draft.jobId}-${randomUUID()}.tmp`, draftsFolder);
  await writeFile(temporary, JSON.stringify(draft, null, 2) + "\n", { flag: "wx" });
  await rename(temporary, draftPath(draft.jobId));
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

function printableCv(draft: LocalDraft): string {
  const lines = draft.cvText.split(/\r?\n/);
  const content = lines
    .slice(3)
    .map((line) => {
      if (!line.trim()) return "<div class=space></div>";
      if (/^[A-ZĄĆĘŁŃÓŚŹŻ ]{4,}$/.test(line)) return `<h2>${escapeHtml(line)}</h2>`;
      if (line.startsWith("- ")) return `<p class=bullet>• ${escapeHtml(line.slice(2))}</p>`;
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${escapeHtml(draft.company)} — CV</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>@page{size:A4;margin:16mm}body{font:10pt/1.35 Arial,sans-serif;color:#172334;max-width:850px;margin:24px auto;padding:0 20px}h1{font-size:22pt;margin:0 0 3px}h2{font-size:11pt;margin:13px 0 4px;border-bottom:1px solid #ccd8d0}p{margin:0 0 4px;overflow-wrap:anywhere}.role{font-weight:bold;font-size:11pt}.contact{font-size:9pt;margin:5px 0 12px}.bullet{margin-left:13px}.space{height:5px}@media print{body{margin:0;padding:0}}}</style></head><body><h1>${escapeHtml(lines[0] ?? "")}</h1><p class=role>${escapeHtml(lines[1] ?? "")}</p><p class=contact>${escapeHtml(lines[2] ?? "")}</p>${content}</body></html>`;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.headers.host !== `127.0.0.1:${port}`) {
    json(response, 403, { error: "Invalid host" });
    return;
  }
  const pathname = new URL(request.url ?? "/", origin).pathname;
  if (pathname === "/api/reviews" && request.method === "GET") {
    json(response, 200, await readStore());
    return;
  }
  if (pathname === "/api/reviews" && request.method === "PUT") {
    if (
      request.headers.origin !== origin ||
      !request.headers["content-type"]?.startsWith("application/json")
    ) {
      json(response, 403, { error: "Invalid origin or content type" });
      return;
    }
    const change = ReviewChange.parse(await readBody(request));
    const write = pendingWrite.then(async () => {
      const updated = updateReviewStore(await readStore(), change, new Date().toISOString());
      await saveStore(updated);
      return updated.records.find((record) => record.url === change.url);
    });
    pendingWrite = write.catch(() => undefined);
    json(response, 200, { record: await write });
    return;
  }
  if (pathname === "/api/application-brief" && request.method === "POST") {
    if (
      request.headers.origin !== origin ||
      !request.headers["content-type"]?.startsWith("application/json")
    ) {
      json(response, 403, { error: "Invalid origin or content type" });
      return;
    }
    const { jobId } = BriefRequest.parse(await readBody(request));
    const report = JSON.parse(
      await readFile(new URL("comparison-report.json", privateFolder), "utf8"),
    );
    const profile = JSON.parse(
      await readFile(new URL("candidate-profile.json", privateFolder), "utf8"),
    );
    let markdown: string;
    try {
      markdown = buildApplicationBrief(report, profile, jobId, new Date().toISOString()).markdown;
    } catch (error) {
      if (error instanceof Error && /Профиль изменился|Вакансия отсутствует/.test(error.message)) {
        json(response, 409, { error: error.message });
        return;
      }
      throw error;
    }
    const folder = new URL("application-briefs/", privateFolder);
    await mkdir(folder, { recursive: true });
    const temporary = new URL(`${jobId}-${randomUUID()}.tmp`, folder);
    await writeFile(temporary, markdown, { flag: "wx" });
    await rename(temporary, new URL(`${jobId}.md`, folder));
    json(response, 200, { path: `application-briefs/${jobId}.md` });
    return;
  }
  if (pathname === "/api/application-draft" && request.method === "POST") {
    if (
      request.headers.origin !== origin ||
      !request.headers["content-type"]?.startsWith("application/json")
    ) {
      json(response, 403, { error: "Invalid origin or content type" });
      return;
    }
    const { jobId } = BriefRequest.parse(await readBody(request));
    const report = JSON.parse(
      await readFile(new URL("comparison-report.json", privateFolder), "utf8"),
    );
    const profile = JSON.parse(
      await readFile(new URL("candidate-profile.json", privateFolder), "utf8"),
    );
    let brief: ReturnType<typeof buildApplicationBrief>["brief"];
    try {
      brief = buildApplicationBrief(report, profile, jobId, new Date().toISOString()).brief;
    } catch (error) {
      if (error instanceof Error && /Профиль изменился|Вакансия отсутствует/.test(error.message)) {
        json(response, 409, { error: error.message });
        return;
      }
      throw error;
    }
    const existing = await readDraft(jobId);
    if (existing) {
      json(response, 200, {
        draft: existing,
        stale:
          existing.profileHash !== brief.profileHash ||
          existing.contentHash !== brief.job.contentHash,
      });
      return;
    }
    let contact: ApplicantContact;
    try {
      contact = ApplicantContact.parse(
        JSON.parse(await readFile(new URL("applicant-contact.json", privateFolder), "utf8")),
      );
    } catch {
      json(response, 409, {
        error:
          "Добавь свои контакты в private/applicant-contact.json по инструкции в docs/local-dashboard.md.",
      });
      return;
    }
    const draft = buildLocalDraft(brief, contact, new Date().toISOString());
    await saveDraft(draft);
    json(response, 200, { draft, stale: false });
    return;
  }
  if (pathname === "/api/application-draft" && request.method === "PUT") {
    if (
      request.headers.origin !== origin ||
      !request.headers["content-type"]?.startsWith("application/json")
    ) {
      json(response, 403, { error: "Invalid origin or content type" });
      return;
    }
    const update = DraftUpdate.parse(await readBody(request, 70_000));
    const current = await readDraft(update.jobId);
    if (!current) {
      json(response, 404, { error: "Черновик не найден" });
      return;
    }
    const draft = LocalDraft.parse({ ...current, ...update, updatedAt: new Date().toISOString() });
    await saveDraft(draft);
    json(response, 200, { draft });
    return;
  }
  if (request.method !== "GET") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }
  let file: URL | null = null;
  let contentType = "text/html; charset=utf-8";
  if (pathname === "/" || pathname === "/dashboard.html") {
    file = new URL("dashboard.html", privateFolder);
  } else {
    const printable = /^\/application-drafts\/([0-9a-fA-F-]{36})\/(cv|letter\.txt)$/.exec(pathname);
    if (printable) {
      const draft = await readDraft(printable[1]!);
      if (!draft) {
        json(response, 404, { error: "Черновик не найден" });
        return;
      }
      response.writeHead(200, {
        "Content-Type":
          printable[2] === "cv" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      });
      response.end(printable[2] === "cv" ? printableCv(draft) : draft.letterText);
      return;
    }
    const brief = /^\/application-briefs\/([0-9a-fA-F-]{36})\.md$/.exec(pathname);
    if (brief) {
      file = new URL(`application-briefs/${brief[1]}.md`, privateFolder);
      contentType = "text/plain; charset=utf-8";
    }
    const match = /^\/applications\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(
      pathname,
    );
    if (match) {
      file = new URL(`applications/${match[1]}/${match[2]}`, privateFolder);
      contentType = match[2]!.endsWith(".pdf") ? "application/pdf" : "text/plain; charset=utf-8";
    }
  }
  if (!file) {
    json(response, 404, { error: "Not found" });
    return;
  }
  try {
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      json(response, 404, { error: "Not found" });
      return;
    }
    throw error;
  }
}

await buildDashboard();
createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error("Ошибка локальной панели:", error);
    if (!response.headersSent) json(response, 500, { error: "Не удалось выполнить действие" });
    else response.end();
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Панель открыта: ${origin}`);
  console.log(`Отметки сохраняются в ${fileURLToPath(storePath)}`);
});
