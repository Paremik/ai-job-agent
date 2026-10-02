import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildDashboardData } from "../src/dashboard/view-model.js";

export async function loadApplicationTrackers(privateFolder: URL): Promise<unknown[]> {
  const tracker: unknown[] = [];
  const applicationFolders = await readdir(new URL("applications/", privateFolder), {
    withFileTypes: true,
  }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  for (const folder of applicationFolders
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name))) {
    const trackerPath = new URL(
      `applications/${folder.name}/application-tracker.json`,
      privateFolder,
    );
    let items: unknown;
    try {
      items = JSON.parse(await readFile(trackerPath, "utf8"));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        continue;
      throw error;
    }
    if (!Array.isArray(items)) throw new Error("Invalid application tracker");
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("Invalid application tracker item");
      tracker.push({ ...item, folder: folder.name });
    }
  }
  return tracker;
}

export async function buildDashboard() {
  const privateFolder = new URL("../private/", import.meta.url);
  const report = JSON.parse(
    await readFile(new URL("comparison-report.json", privateFolder), "utf8"),
  );
  const tracker = await loadApplicationTrackers(privateFolder);
  const data = buildDashboardData(report, tracker);
  const template = await readFile(new URL("../dashboard/template.html", import.meta.url), "utf8");
  const marker = "__DASHBOARD_DATA_BASE64__";
  if (template.split(marker).length !== 2)
    throw new Error("Dashboard template marker is missing or repeated");
  const encoded = Buffer.from(JSON.stringify(data), "utf8").toString("base64");
  const output = new URL("dashboard.html", privateFolder);
  await writeFile(output, template.replace(marker, encoded));
  console.log(`Панель создана: ${fileURLToPath(output)}`);
  console.log(
    `Вакансий: ${data.counts.all}; черновиков: ${data.drafts.length}. Открой private/dashboard.html в браузере.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildDashboard().catch(() => {
    console.error(
      "Не удалось создать панель. Сначала запусти pnpm match:profile и проверь локальный журнал откликов.",
    );
    process.exitCode = 1;
  });
}
