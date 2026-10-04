import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

export async function writeAtomicFile(destination: URL, content: string): Promise<void> {
  const temporary = new URL(`.${randomUUID()}.tmp`, destination);
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
