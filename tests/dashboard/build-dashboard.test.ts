import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadApplicationTrackers } from "../../scripts/build-dashboard.js";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unsafe test path");
    await rm(directory, { recursive: true, force: true });
  }
});

describe("application package discovery", () => {
  it("loads all dated trackers with the newest first", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-job-packages-"));
    directories.push(directory);
    for (const date of ["2026-10-01", "2026-10-02"]) {
      const folder = join(directory, "applications", date);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "application-tracker.json"), JSON.stringify([{ key: date }]));
    }
    const items = await loadApplicationTrackers(pathToFileURL(directory + sep));
    expect(items).toEqual([
      { key: "2026-10-02", folder: "2026-10-02" },
      { key: "2026-10-01", folder: "2026-10-01" },
    ]);
  });

  it("works before any application package exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-job-packages-"));
    directories.push(directory);
    expect(await loadApplicationTrackers(pathToFileURL(directory + sep))).toEqual([]);
  });
});
