import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ReviewChange, ReviewStore, updateReviewStore } from "../src/dashboard/review-store.js";
import { buildDashboard } from "./build-dashboard.js";

const privateFolder = new URL("../private/", import.meta.url);
const storePath = new URL("dashboard-reviews.json", privateFolder);
const port = 4173;
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

async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Request too large");
  }
  return JSON.parse(body);
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
  if (request.method !== "GET") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }
  let file: URL | null = null;
  let contentType = "text/html; charset=utf-8";
  if (pathname === "/" || pathname === "/dashboard.html") {
    file = new URL("dashboard.html", privateFolder);
  } else {
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
