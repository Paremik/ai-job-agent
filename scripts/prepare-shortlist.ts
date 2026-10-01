import { readFile, writeFile, mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/infrastructure/database/client.js";
import { jobs, companies } from "../src/infrastructure/database/schema.js";
import { groupPossibleDuplicates } from "../src/matching/duplicate-groups.js";
import { fetchPage, jobPostings } from "../src/sources/public-boards.js";
import { descriptionText } from "../src/matching/extract-location.js";

async function main() {
  const folder = new URL("../private/", import.meta.url);
  const db = createDatabase();
  try {
    const rows = await db.db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: companies.name,
        canonicalUrl: jobs.canonicalUrl,
        location: jobs.location,
        description: jobs.description,
        contentHash: jobs.contentHash,
      })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id));
    await mkdir(new URL("enrichment/", folder), { recursive: true });
    await writeFile(new URL("job-review-snapshot.json", folder), JSON.stringify(rows, null, 2));
    const groups = groupPossibleDuplicates(rows);
    await writeFile(
      new URL("duplicate-groups.json", folder),
      JSON.stringify(
        groups.map(({ representative, members, ...rest }) => ({
          ...rest,
          representative: representative.id,
          members: members.map(({ description, ...metadata }) => ({
            ...metadata,
            descriptionLength: description.length,
          })),
        })),
        null,
        2,
      ),
    );
    const plan = JSON.parse(await readFile(new URL("enrichment-plan.json", folder), "utf8")) as {
      jobId: string;
      url: string;
    }[];
    const allowed = new Set([
      "jit.team",
      "ailleron.com",
      "www.globallogic.com",
      "justjoin.it",
      "www.bluefield.tech",
      "job-boards.greenhouse.io",
      "www.aliorbank.pl",
    ]);
    const stopped = new Set<string>();
    const outcomes: {
      jobId: string;
      url: string;
      contentHash: string | null;
      checkedAt: string;
      status: string;
      characters: number;
    }[] = [];
    for (const item of plan.slice(0, 40)) {
      const saved = rows.find((row) => row.id === item.jobId);
      if (!saved) throw new Error("Unknown job ID in enrichment plan");
      const url = new URL(item.url);
      if (
        url.protocol !== "https:" ||
        url.port ||
        url.username ||
        url.password ||
        !allowed.has(url.hostname)
      )
        throw new Error("Unapproved public source");
      const outcome = {
        ...item,
        contentHash: saved.contentHash,
        checkedAt: new Date().toISOString(),
        status: "not_checked",
        characters: 0,
      };
      if (stopped.has(url.hostname)) {
        outcome.status = "host_blocked";
        outcomes.push(outcome);
        continue;
      }
      try {
        const page = await fetchPage(item.url);
        outcome.status = `http_${page.status}`;
        if ([401, 403, 429].includes(page.status)) stopped.add(url.hostname);
        if (page.status === 200) {
          const postings = jobPostings(page.text);
          // Keep page and extracted text as supplementary evidence, never overwrite a job based on guessed identity.
          const structured = postings.length === 1 ? postings[0] : null;
          const raw = structured?.description;
          const text = descriptionText(typeof raw === "string" ? raw : page.text);
          outcome.characters = text.length;
          outcome.status = structured
            ? "structured_description_available"
            : "page_text_needs_review";
          await writeFile(new URL(`enrichment/${saved.id}.html`, folder), page.text);
          await writeFile(
            new URL(`enrichment/${saved.id}.json`, folder),
            JSON.stringify({ ...outcome, text, structured }, null, 2),
          );
        }
      } catch {
        outcome.status = "unavailable";
      }
      outcomes.push(outcome);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await writeFile(new URL("enrichment-results.json", folder), JSON.stringify(outcomes, null, 2));
    const report = JSON.parse(
      await readFile(new URL("comparison-report.json", folder), "utf8"),
    ) as { rows: { id: string; priority: { signals?: { incomplete: boolean } } }[] };
    const gaps = report.rows
      .filter((row) => row.priority.signals?.incomplete)
      .map((row) => {
        const saved = rows.find((value) => value.id === row.id)!;
        return {
          id: row.id,
          title: saved.title,
          url: saved.canonicalUrl,
          reason: /Jooble search snippet|RSS summary/.test(saved.description)
            ? "source_snippet"
            : "parser_coverage_unknown",
          enrichment:
            outcomes.find((item) => item.jobId === row.id)?.status ?? "needs_source_review",
        };
      });
    await writeFile(new URL("enrichment-backlog.json", folder), JSON.stringify(gaps, null, 2));
    console.log(
      JSON.stringify({
        jobs: rows.length,
        displayGroups: groups.length,
        possibleDuplicateGroups: groups.filter((group) => group.members.length > 1).length,
        attempted: outcomes.length,
        available: outcomes.filter((row) => row.characters > 0).length,
        unresolvedDescriptions: gaps.length,
      }),
    );
  } finally {
    await db.close();
  }
}
await main().catch(() => {
  console.error(
    "Не удалось подготовить список; проверьте базу и локальный план. Реквизиты скрыты.",
  );
  process.exitCode = 1;
});
