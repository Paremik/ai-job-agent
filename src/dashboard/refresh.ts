import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export type RefreshState = {
  status: "idle" | "running" | "completed" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
};

// Fixed commands only; no browser input is passed to the process or shell.
function runScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--env-file-if-exists=.env", "--import", "tsx", script],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        shell: false,
        windowsHide: true,
        stdio: "ignore",
        timeout: 120_000,
      },
    );
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Local refresh failed"));
    });
  });
}

export function createDashboardRefresh() {
  let state: RefreshState = { status: "idle", startedAt: null, finishedAt: null };
  return {
    current: () => ({ ...state }),
    start() {
      if (state.status === "running") return { ...state };
      state = { status: "running", startedAt: new Date().toISOString(), finishedAt: null };
      void (async () => {
        try {
          await runScript("scripts/compare-jobs.ts");
          await runScript("scripts/build-dashboard.ts");
          state = { ...state, status: "completed", finishedAt: new Date().toISOString() };
        } catch {
          state = { ...state, status: "failed", finishedAt: new Date().toISOString() };
        }
      })();
      return { ...state };
    },
  };
}
